import "server-only";

import { getGoogleAccessToken } from "@/utils/google-auth";

type BigQueryField = {
  name: string;
  type: string;
  mode?: string;
  fields?: BigQueryField[];
};

type BigQueryCell = {
  v: unknown;
};

type BigQueryRow = {
  f: BigQueryCell[];
};

type BigQueryQueryPayload = {
  jobComplete?: boolean;
  jobReference?: {
    jobId?: string;
  };
  rows?: BigQueryRow[];
  schema?: {
    fields?: BigQueryField[];
  };
  totalRows?: string;
  error?: {
    message?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
};

const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery";

function getProjectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCP_PROJECT_ID ??
    process.env.BIGQUERY_PROJECT_ID ??
    "baseballsite"
  );
}

function getLocation() {
  return process.env.BIGQUERY_LOCATION ?? "asia-northeast1";
}

function decodeFieldValue(field: BigQueryField, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (field.mode === "REPEATED" && Array.isArray(raw)) {
    return raw.map((item) =>
      decodeFieldValue(
        {
          ...field,
          mode: "NULLABLE",
        },
        typeof item === "object" && item !== null && "v" in item
          ? (item as BigQueryCell).v
          : item,
      ),
    );
  }

  if (field.type === "RECORD" && field.fields) {
    const nested = raw as BigQueryRow;
    const record: Record<string, unknown> = {};

    field.fields.forEach((nestedField, index) => {
      record[nestedField.name] = decodeFieldValue(nestedField, nested.f[index]?.v);
    });

    return record;
  }

  if (typeof raw !== "string") {
    return raw;
  }

  switch (field.type) {
    case "BOOL":
    case "BOOLEAN":
      return raw === "true";
    case "FLOAT":
    case "FLOAT64":
    case "NUMERIC":
    case "BIGNUMERIC":
    case "INTEGER":
    case "INT64":
      return Number(raw);
    default:
      return raw;
  }
}

function mapRows<T>(payload: BigQueryQueryPayload) {
  const fields = payload.schema?.fields ?? [];
  const rows = payload.rows ?? [];

  return rows.map((row) => {
    const record: Record<string, unknown> = {};

    fields.forEach((field, index) => {
      record[field.name] = decodeFieldValue(field, row.f[index]?.v);
    });

    return record as T;
  });
}

async function pollQueryResults(projectId: string, jobId: string, accessToken: string) {
  const location = getLocation();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?location=${location}&maxResults=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BigQuery poll failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as BigQueryQueryPayload;
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    if (payload.jobComplete) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("BigQuery query did not finish within the retry window.");
}

export async function runBigQueryQuery<T>(query: string) {
  const projectId = getProjectId();
  const location = getLocation();
  const accessToken = await getGoogleAccessToken(BIGQUERY_SCOPE);

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        location,
        maxResults: 1000,
        query,
        timeoutMs: 10000,
        useLegacySql: false,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BigQuery query failed: ${response.status} ${text}`);
  }

  let payload = (await response.json()) as BigQueryQueryPayload;
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (!payload.jobComplete) {
    const jobId = payload.jobReference?.jobId;
    if (!jobId) {
      throw new Error("BigQuery query did not return a finished job or job id.");
    }

    payload = await pollQueryResults(projectId, jobId, accessToken);
  }

  return mapRows<T>(payload);
}
