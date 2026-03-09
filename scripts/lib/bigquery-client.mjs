async function bigQueryRequest(path, { method = "GET", body, token }) {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function decodeFieldValue(field, raw) {
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
        typeof item === "object" && item !== null && "v" in item ? item.v : item,
      ),
    );
  }

  if (field.type === "RECORD" && field.fields) {
    const record = {};

    field.fields.forEach((nestedField, index) => {
      record[nestedField.name] = decodeFieldValue(nestedField, raw.f[index]?.v);
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

function mapRows(payload) {
  const fields = payload.schema?.fields ?? [];
  const rows = payload.rows ?? [];

  return rows.map((row) => {
    const record = {};

    fields.forEach((field, index) => {
      record[field.name] = decodeFieldValue(field, row.f[index]?.v);
    });

    return record;
  });
}

async function pollQueryResults({ projectId, jobId, token, location, maxResults }) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const payload = await bigQueryRequest(
      `projects/${projectId}/queries/${jobId}?location=${location}&maxResults=${maxResults}`,
      {
        token,
      },
    );

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

export async function insertAllRows({
  projectId,
  datasetId,
  tableId,
  rows,
  token,
  chunkSize = 500,
}) {
  let insertedRowCount = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const response = await bigQueryRequest(
      `projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`,
      {
        method: "POST",
        token,
        body: {
          ignoreUnknownValues: false,
          skipInvalidRows: false,
          rows: chunk,
        },
      },
    );

    if (response.insertErrors?.length) {
      throw new Error(
        `BigQuery insertAll returned ${response.insertErrors.length} row error(s) for ${datasetId}.${tableId}: ${JSON.stringify(response.insertErrors)}`,
      );
    }

    insertedRowCount += chunk.length;
  }

  return { insertedRowCount };
}

export async function runQuery({
  projectId,
  query,
  token,
  location = "asia-northeast1",
  maxResults = 1000,
}) {
  let payload = await bigQueryRequest(`projects/${projectId}/queries`, {
    method: "POST",
    token,
    body: {
      location,
      maxResults,
      query,
      timeoutMs: 10000,
      useLegacySql: false,
    },
  });

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (!payload.jobComplete) {
    const jobId = payload.jobReference?.jobId;

    if (!jobId) {
      throw new Error("BigQuery query did not return a finished job or job id.");
    }

    payload = await pollQueryResults({
      projectId,
      jobId,
      token,
      location,
      maxResults,
    });
  }

  return mapRows(payload);
}
