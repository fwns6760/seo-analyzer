import { getAccessToken } from "./lib/google-auth.mjs";
import { runQuery } from "./lib/bigquery-client.mjs";

const BIGQUERY_SCOPE = "BigQuery read scope";
const comparisonWindowDays = 14;

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

function resolveConfig() {
  const args = parseArgs(process.argv.slice(2));

  return {
    json: args.json,
    projectId:
      process.env.BIGQUERY_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      "baseballsite",
    rawDatasetId: process.env.BIGQUERY_RAW_DATASET || "seo_raw",
    martDataset: process.env.BIGQUERY_MART_DATASET || "seo_mart",
    location: process.env.BIGQUERY_LOCATION || "asia-northeast1",
  };
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function addDaysToDateString(value, days) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day + days));

  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate(),
  )}`;
}

function buildSummaryQuery({ projectId, rawDatasetId, martDataset }) {
  return `
WITH raw_gsc_latest AS (
  SELECT MAX(data_date) AS latest_date
  FROM \`${projectId}.${rawDatasetId}.raw_gsc\`
  WHERE grain = "page_daily"
),
raw_gsc_latest_counts AS (
  SELECT
    COUNT(*) AS latest_day_rows,
    COUNT(DISTINCT batch_id) AS latest_day_batches
  FROM \`${projectId}.${rawDatasetId}.raw_gsc\` AS r
  CROSS JOIN raw_gsc_latest AS a
  WHERE r.grain = "page_daily"
    AND r.data_date = a.latest_date
),
raw_ga4_latest AS (
  SELECT MAX(data_date) AS latest_date
  FROM \`${projectId}.${rawDatasetId}.raw_ga4\`
  WHERE grain = "landing_page_daily"
),
raw_ga4_latest_counts AS (
  SELECT
    COUNT(*) AS latest_day_rows,
    COUNT(DISTINCT batch_id) AS latest_day_batches
  FROM \`${projectId}.${rawDatasetId}.raw_ga4\` AS r
  CROSS JOIN raw_ga4_latest AS a
  WHERE r.grain = "landing_page_daily"
    AND r.data_date = a.latest_date
),
page_anchor AS (
  SELECT
    MAX(data_date) AS latest_date,
    COUNT(DISTINCT data_date) AS active_days
  FROM \`${projectId}.${martDataset}.page_daily\`
),
candidate_summary AS (
  SELECT
    MAX(reference_end_date) AS reference_end_date,
    COUNT(*) AS total_rows,
    COUNTIF(entity_type = "page" AND previous_clicks IS NOT NULL) AS page_previous_rows
  FROM \`${projectId}.${martDataset}.improvement_candidates_base\`
  WHERE reference_end_date IS NOT NULL
)
SELECT
  g.latest_date AS raw_gsc_latest_date,
  gc.latest_day_rows AS raw_gsc_latest_day_rows,
  gc.latest_day_batches AS raw_gsc_latest_day_batches,
  a.latest_date AS raw_ga4_latest_date,
  ac.latest_day_rows AS raw_ga4_latest_day_rows,
  ac.latest_day_batches AS raw_ga4_latest_day_batches,
  p.latest_date AS page_daily_latest_date,
  p.active_days AS page_daily_active_days,
  c.reference_end_date AS candidate_reference_end_date,
  c.total_rows AS candidate_total_rows,
  c.page_previous_rows AS candidate_page_previous_rows
FROM raw_gsc_latest AS g
CROSS JOIN raw_gsc_latest_counts AS gc
CROSS JOIN raw_ga4_latest AS a
CROSS JOIN raw_ga4_latest_counts AS ac
CROSS JOIN page_anchor AS p
CROSS JOIN candidate_summary AS c
`;
}

function buildReadinessSummary(row) {
  const activeDays = Math.max(0, Math.floor(row.page_daily_active_days ?? 0));
  const readyByWindow = activeDays >= comparisonWindowDays;
  const remainingDays = readyByWindow ? 0 : Math.max(comparisonWindowDays - activeDays, 0);
  const etaDate = addDaysToDateString(row.page_daily_latest_date, remainingDays);
  const readyByCandidateData = (row.candidate_page_previous_rows ?? 0) > 0;

  let status = "collecting";

  if (readyByCandidateData) {
    status = "ready";
  } else if (readyByWindow) {
    status = "window_ready_but_previous_missing";
  }

  return {
    targetDays: comparisonWindowDays,
    activeDays,
    remainingDays,
    etaDate,
    readyByWindow,
    readyByCandidateData,
    status,
  };
}

function printHumanSummary(summary) {
  console.log("SEO data readiness");
  console.log(
    `- raw_gsc page_daily latest: ${summary.raw.gsc.latestDate ?? "-"} (${summary.raw.gsc.latestDayRows} rows / ${summary.raw.gsc.latestDayBatches} batch)`,
  );
  console.log(
    `- raw_ga4 landing_page_daily latest: ${summary.raw.ga4.latestDate ?? "-"} (${summary.raw.ga4.latestDayRows} rows / ${summary.raw.ga4.latestDayBatches} batch)`,
  );
  console.log(
    `- mart page_daily latest: ${summary.mart.pageDailyLatestDate ?? "-"} (${summary.comparison.activeDays}/${summary.comparison.targetDays} days)`,
  );
  console.log(
    `- candidates reference: ${summary.mart.candidateReferenceEndDate ?? "-"} (${summary.mart.candidateTotalRows} rows / previous-ready ${summary.mart.candidatePagePreviousRows})`,
  );
  console.log(
    `- comparison status: ${summary.comparison.status}${summary.comparison.etaDate ? ` / eta ${summary.comparison.etaDate}` : ""}`,
  );
}

async function main() {
  const config = resolveConfig();
  const token = await getAccessToken(BIGQUERY_SCOPE);
  const [row] = await runQuery({
    projectId: config.projectId,
    query: buildSummaryQuery(config),
    token,
    location: config.location,
  });

  if (!row) {
    throw new Error("No readiness summary row was returned from BigQuery.");
  }

  const comparison = buildReadinessSummary(row);
  const summary = {
    projectId: config.projectId,
    raw: {
      gsc: {
        latestDate: row.raw_gsc_latest_date ?? null,
        latestDayRows: row.raw_gsc_latest_day_rows ?? 0,
        latestDayBatches: row.raw_gsc_latest_day_batches ?? 0,
      },
      ga4: {
        latestDate: row.raw_ga4_latest_date ?? null,
        latestDayRows: row.raw_ga4_latest_day_rows ?? 0,
        latestDayBatches: row.raw_ga4_latest_day_batches ?? 0,
      },
    },
    mart: {
      pageDailyLatestDate: row.page_daily_latest_date ?? null,
      pageDailyActiveDays: row.page_daily_active_days ?? 0,
      candidateReferenceEndDate: row.candidate_reference_end_date ?? null,
      candidateTotalRows: row.candidate_total_rows ?? 0,
      candidatePagePreviousRows: row.candidate_page_previous_rows ?? 0,
    },
    comparison,
  };

  if (config.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printHumanSummary(summary);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
