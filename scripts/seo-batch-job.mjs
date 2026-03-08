import { getAccessToken } from "./lib/google-auth.mjs";
import { resolveBatchDateRange } from "./lib/date-range.mjs";
import { insertAllRows } from "./lib/bigquery-client.mjs";
import { listGscSites, pickSite, queryAllGscRows } from "./lib/gsc-client.mjs";
import { chooseProperty, listAccountSummaries, runAllGa4Rows } from "./lib/ga4-client.mjs";

const gscGrains = [
  { grain: "site_daily", dimensions: ["date"] },
  { grain: "page_daily", dimensions: ["date", "page"] },
  { grain: "query_daily", dimensions: ["date", "query"] },
  { grain: "page_query_daily", dimensions: ["date", "page", "query"] },
];

const ga4Grains = [
  { grain: "site_daily", dimensions: ["date"] },
  { grain: "landing_page_daily", dimensions: ["date", "landingPage"] },
];

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1];
      continue;
    }

    if (arg.startsWith("--start-date=")) {
      options.startDate = arg.split("=")[1];
      continue;
    }

    if (arg.startsWith("--end-date=")) {
      options.endDate = arg.split("=")[1];
    }
  }

  return options;
}

function resolveConfig() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || process.env.BATCH_TARGET || "all";
  const dryRun = args.dryRun || process.env.DRY_RUN === "true";
  const projectId =
    process.env.BIGQUERY_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "baseballsite";
  const rawDatasetId = process.env.BIGQUERY_RAW_DATASET || "seo_raw";
  const dateRange = resolveBatchDateRange({
    startDate: args.startDate,
    endDate: args.endDate,
  });

  if (!["all", "gsc", "ga4"].includes(target)) {
    throw new Error(`Unsupported target ${target}. Use one of: all, gsc, ga4.`);
  }

  return {
    target,
    dryRun,
    projectId,
    rawDatasetId,
    ...dateRange,
  };
}

function createBatchId({ target, startDate, endDate }) {
  const compactTimestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `seo-${target}-${startDate}-${endDate}-${compactTimestamp}`;
}

function mapGscRowsToBigQuery({
  rows,
  grain,
  dimensions,
  siteUrl,
  fetchedAt,
  batchId,
  startDate,
  endDate,
}) {
  return rows.map((row, index) => {
    const keys = row.keys || [];
    const dimensionMap = Object.fromEntries(dimensions.map((name, idx) => [name, keys[idx] || null]));

    return {
      insertId: `${batchId}-${grain}-${index}`,
      json: {
        fetched_at: fetchedAt,
        batch_id: batchId,
        source_start_date: startDate,
        source_end_date: endDate,
        site_url: siteUrl,
        data_date: dimensionMap.date,
        grain,
        page: dimensionMap.page,
        query: dimensionMap.query,
        country: null,
        device: null,
        search_type: "web",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      },
    };
  });
}

function parseGa4MetricValue(metricValue) {
  if (metricValue == null || metricValue === "") {
    return null;
  }

  const numeric = Number(metricValue);
  return Number.isNaN(numeric) ? null : numeric;
}

function normalizeGa4Date(dateText) {
  if (!dateText) {
    return null;
  }

  if (/^\d{8}$/.test(dateText)) {
    return `${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}`;
  }

  return dateText;
}

function mapGa4RowsToBigQuery({
  rows,
  grain,
  dimensions,
  propertyId,
  webStreamDefaultUri,
  fetchedAt,
  batchId,
  startDate,
  endDate,
}) {
  return rows.map((row, index) => {
    const dimensionMap = Object.fromEntries(
      dimensions.map((name, idx) => [name, row.dimensionValues?.[idx]?.value || null]),
    );
    const metricMap = {
      sessions: parseGa4MetricValue(row.metricValues?.[0]?.value) ?? 0,
      totalUsers: parseGa4MetricValue(row.metricValues?.[1]?.value) ?? 0,
      keyEvents: parseGa4MetricValue(row.metricValues?.[2]?.value),
    };

    return {
      insertId: `${batchId}-${grain}-${index}`,
      json: {
        fetched_at: fetchedAt,
        batch_id: batchId,
        source_start_date: startDate,
        source_end_date: endDate,
        property_id: propertyId,
        web_stream_default_uri: webStreamDefaultUri,
        data_date: normalizeGa4Date(dimensionMap.date),
        grain,
        landing_page: dimensionMap.landingPage,
        session_default_channel_group: "Organic Search",
        sessions: metricMap.sessions,
        total_users: metricMap.totalUsers,
        key_events: metricMap.keyEvents,
      },
    };
  });
}

async function fetchGscSummary({ token, startDate, endDate, batchId }) {
  const siteEntries = await listGscSites(token);
  if (siteEntries.length === 0) {
    throw new Error("No Search Console properties were returned for the authenticated identity.");
  }

  const siteUrl = pickSite(siteEntries);
  const fetchedAt = new Date().toISOString();
  const rowsByGrain = {};
  const bigQueryRows = [];

  for (const spec of gscGrains) {
    const rows = await queryAllGscRows({
      token,
      siteUrl,
      startDate,
      endDate,
      dimensions: spec.dimensions,
    });
    rowsByGrain[spec.grain] = rows.length;
    bigQueryRows.push(
      ...mapGscRowsToBigQuery({
        rows,
        grain: spec.grain,
        dimensions: spec.dimensions,
        siteUrl,
        fetchedAt,
        batchId,
        startDate,
        endDate,
      }),
    );
  }

  return {
    source: "gsc",
    siteUrl,
    availableSites: siteEntries.length,
    rowCount: bigQueryRows.length,
    rowCountByGrain: rowsByGrain,
    sampleRows: bigQueryRows.slice(0, 3).map((row) => row.json),
    bigQueryRows,
  };
}

async function fetchGa4Summary({ token, startDate, endDate, batchId }) {
  const accountSummaries = await listAccountSummaries(token);
  const { chosenProperty, inspectedStreams } = await chooseProperty(accountSummaries, token);
  const fetchedAt = new Date().toISOString();
  const rowsByGrain = {};
  const bigQueryRows = [];

  for (const spec of ga4Grains) {
    const report = await runAllGa4Rows({
      propertyName: chosenProperty.property,
      token,
      startDate,
      endDate,
      dimensions: spec.dimensions,
      metrics: ["sessions", "totalUsers", "keyEvents"],
    });
    rowsByGrain[spec.grain] = report.rows.length;
    bigQueryRows.push(
      ...mapGa4RowsToBigQuery({
        rows: report.rows,
        grain: spec.grain,
        dimensions: spec.dimensions,
        propertyId: chosenProperty.property,
        webStreamDefaultUri:
          inspectedStreams.find((stream) => stream.property === chosenProperty.property)?.defaultUri || null,
        fetchedAt,
        batchId,
        startDate,
        endDate,
      }),
    );
  }

  return {
    source: "ga4",
    property: chosenProperty.property,
    propertyDisplayName: chosenProperty.propertyDisplayName,
    inspectedStreamCount: inspectedStreams.length,
    rowCount: bigQueryRows.length,
    rowCountByGrain: rowsByGrain,
    sampleRows: bigQueryRows.slice(0, 3).map((row) => row.json),
    bigQueryRows,
  };
}

async function main() {
  const config = resolveConfig();

  console.log("SEO batch job configuration");
  console.log(JSON.stringify(config, null, 2));

  if (config.dryRun) {
    console.log("Dry run completed. No external APIs were called.");
    return;
  }

  const batchId = createBatchId(config);
  const token = await getAccessToken(
    "Search Console and Google Analytics read scopes",
  );
  const results = [];

  if (config.target === "all" || config.target === "gsc") {
    results.push(await fetchGscSummary({ token, batchId, ...config }));
  }

  if (config.target === "all" || config.target === "ga4") {
    results.push(await fetchGa4Summary({ token, batchId, ...config }));
  }

  const inserted = [];

  for (const result of results) {
    if (result.source === "gsc") {
      const summary = await insertAllRows({
        projectId: config.projectId,
        datasetId: config.rawDatasetId,
        tableId: "raw_gsc",
        rows: result.bigQueryRows,
        token,
      });
      inserted.push({ source: "gsc", ...summary });
    }

    if (result.source === "ga4") {
      const summary = await insertAllRows({
        projectId: config.projectId,
        datasetId: config.rawDatasetId,
        tableId: "raw_ga4",
        rows: result.bigQueryRows,
        token,
      });
      inserted.push({ source: "ga4", ...summary });
    }
  }

  console.log("SEO batch job summary");
  console.log(JSON.stringify({
    batchId,
    startDate: config.startDate,
    endDate: config.endDate,
    target: config.target,
    results: results.map(({ bigQueryRows, ...result }) => result),
    inserted,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
