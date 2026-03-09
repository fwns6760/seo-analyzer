import "server-only";

import { runBigQueryQuery } from "@/utils/bigquery";

export type QueryLeaderboardItem = {
  reference_end_date: string;
  query: string;
  current_clicks: number;
  previous_clicks: number;
  clicks_delta: number;
  current_impressions: number;
  previous_impressions: number;
  current_ctr: number | null;
  previous_ctr: number | null;
  current_position: number | null;
  previous_position: number | null;
  max_page_count: number;
  tracked_days: number;
  top_page_path: string | null;
  top_page_canonical_url: string | null;
};

export type QueryTrendPoint = {
  reference_end_date: string;
  data_date: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  page_count: number;
  top_page_path: string | null;
  top_page_canonical_url: string | null;
  has_multiple_pages: boolean;
};

export type QueryPageItem = {
  reference_end_date: string;
  page_path: string;
  canonical_url: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  active_days: number;
};

export type QueryAnalysisData = {
  referenceEndDate: string | null;
  selectedQuery: QueryLeaderboardItem | null;
  leaderboard: QueryLeaderboardItem[];
  trend: QueryTrendPoint[];
  pages: QueryPageItem[];
  requestedSelectionMissing: boolean;
};

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCP_PROJECT_ID ??
  process.env.BIGQUERY_PROJECT_ID ??
  "baseballsite";

const martDataset = process.env.BIGQUERY_MART_DATASET ?? "seo_mart";
const rawDataset = process.env.BIGQUERY_RAW_DATASET ?? "seo_raw";

function martTable(tableName: string) {
  return `\`${projectId}.${martDataset}.${tableName}\``;
}

function rawTable(tableName: string) {
  return `\`${projectId}.${rawDataset}.${tableName}\``;
}

function escapeSqlString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

const leaderboardQuery = `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("query_daily")}
),
periodized AS (
  SELECT
    a.reference_end_date,
    q.data_date,
    q.query,
    q.clicks,
    q.impressions,
    q.ctr,
    q.position,
    q.page_count,
    q.top_page_path,
    q.top_page_canonical_url,
    CASE
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name
  FROM ${martTable("query_daily")} AS q
  CROSS JOIN anchor AS a
  WHERE q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
current_top_page AS (
  SELECT
    reference_end_date,
    query,
    top_page_path,
    top_page_canonical_url,
    ROW_NUMBER() OVER (
      PARTITION BY reference_end_date, query
      ORDER BY clicks DESC, impressions DESC, data_date DESC
    ) AS query_rank
  FROM periodized
  WHERE period_name = "current_7d"
),
aggregated AS (
  SELECT
    reference_end_date,
    query,
    SUM(IF(period_name = "current_7d", COALESCE(clicks, 0), 0)) AS current_clicks,
    SUM(IF(period_name = "previous_7d", COALESCE(clicks, 0), 0)) AS previous_clicks,
    SUM(IF(period_name = "current_7d", COALESCE(impressions, 0), 0)) AS current_impressions,
    SUM(IF(period_name = "previous_7d", COALESCE(impressions, 0), 0)) AS previous_impressions,
    SAFE_DIVIDE(
      SUM(IF(period_name = "current_7d", COALESCE(clicks, 0), 0)),
      NULLIF(SUM(IF(period_name = "current_7d", COALESCE(impressions, 0), 0)), 0)
    ) AS current_ctr,
    SAFE_DIVIDE(
      SUM(IF(period_name = "previous_7d", COALESCE(clicks, 0), 0)),
      NULLIF(SUM(IF(period_name = "previous_7d", COALESCE(impressions, 0), 0)), 0)
    ) AS previous_ctr,
    SAFE_DIVIDE(
      SUM(IF(period_name = "current_7d", COALESCE(position, 0) * COALESCE(impressions, 0), 0)),
      NULLIF(SUM(IF(period_name = "current_7d", COALESCE(impressions, 0), 0)), 0)
    ) AS current_position,
    SAFE_DIVIDE(
      SUM(IF(period_name = "previous_7d", COALESCE(position, 0) * COALESCE(impressions, 0), 0)),
      NULLIF(SUM(IF(period_name = "previous_7d", COALESCE(impressions, 0), 0)), 0)
    ) AS previous_position,
    MAX(IF(period_name = "current_7d", COALESCE(page_count, 0), 0)) AS max_page_count,
    COUNT(DISTINCT IF(period_name = "current_7d", data_date, NULL)) AS tracked_days
  FROM periodized
  WHERE period_name IS NOT NULL
  GROUP BY reference_end_date, query
)
SELECT
  a.reference_end_date,
  a.query,
  a.current_clicks,
  a.previous_clicks,
  a.current_clicks - a.previous_clicks AS clicks_delta,
  a.current_impressions,
  a.previous_impressions,
  a.current_ctr,
  a.previous_ctr,
  a.current_position,
  a.previous_position,
  a.max_page_count,
  a.tracked_days,
  c.top_page_path,
  c.top_page_canonical_url
FROM aggregated AS a
LEFT JOIN current_top_page AS c
  ON a.reference_end_date = c.reference_end_date
 AND a.query = c.query
 AND c.query_rank = 1
ORDER BY a.current_clicks DESC, a.current_impressions DESC, a.query ASC
LIMIT 30
`;

function buildTrendQuery(selectedQuery: string) {
  const escapedQuery = escapeSqlString(selectedQuery);

  return `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("query_daily")}
)
SELECT
  a.reference_end_date,
  q.data_date,
  q.query,
  q.clicks,
  q.impressions,
  q.ctr,
  q.position,
  q.page_count,
  q.top_page_path,
  q.top_page_canonical_url,
  q.has_multiple_pages
FROM ${martTable("query_daily")} AS q
CROSS JOIN anchor AS a
WHERE q.query = '${escapedQuery}'
  AND q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
ORDER BY q.data_date DESC
`;
}

function buildPageBreakdownQuery(selectedQuery: string) {
  const escapedQuery = escapeSqlString(selectedQuery);

  return `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("query_daily")}
),
normalized_page_queries AS (
  SELECT
    data_date,
    query,
    COALESCE(
      NULLIF(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(page, r"^https?://[^/]+", ""),
            r"[?#].*$",
            ""
          ),
          r"/$",
          ""
        ),
        ""
      ),
      "/"
    ) AS page_path,
    clicks,
    impressions,
    position
  FROM ${rawTable("raw_gsc")}
  WHERE grain = "page_query_daily"
    AND query IS NOT NULL
    AND page IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY data_date, site_url, query, page
    ORDER BY fetched_at DESC, batch_id DESC
  ) = 1
)
SELECT
  a.reference_end_date,
  q.page_path,
  CASE
    WHEN q.page_path = "/" THEN "https://yoshilover.com/"
    ELSE CONCAT("https://yoshilover.com", q.page_path)
  END AS canonical_url,
  SUM(COALESCE(q.clicks, 0)) AS clicks,
  SUM(COALESCE(q.impressions, 0)) AS impressions,
  SAFE_DIVIDE(SUM(COALESCE(q.clicks, 0)), NULLIF(SUM(COALESCE(q.impressions, 0)), 0)) AS ctr,
  SAFE_DIVIDE(
    SUM(COALESCE(q.position, 0) * COALESCE(q.impressions, 0)),
    NULLIF(SUM(COALESCE(q.impressions, 0)), 0)
  ) AS position,
  COUNT(DISTINCT q.data_date) AS active_days
FROM normalized_page_queries AS q
CROSS JOIN anchor AS a
WHERE q.query = '${escapedQuery}'
  AND q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
GROUP BY a.reference_end_date, q.page_path
ORDER BY clicks DESC, impressions DESC, q.page_path ASC
LIMIT 20
`;
}

export async function getQueryAnalysisData(selectedQuery: string | null): Promise<QueryAnalysisData> {
  const leaderboard = await runBigQueryQuery<QueryLeaderboardItem>(leaderboardQuery);

  if (leaderboard.length === 0) {
    return {
      referenceEndDate: null,
      selectedQuery: null,
      leaderboard,
      trend: [],
      pages: [],
      requestedSelectionMissing: false,
    };
  }

  const matchedQuery =
    selectedQuery !== null
      ? leaderboard.find((item) => item.query === selectedQuery) ?? null
      : null;
  const requestedSelectionMissing = selectedQuery !== null && matchedQuery === null;

  if (requestedSelectionMissing) {
    return {
      referenceEndDate: leaderboard[0]?.reference_end_date ?? null,
      selectedQuery: null,
      leaderboard,
      trend: [],
      pages: [],
      requestedSelectionMissing: true,
    };
  }

  const selectedQueryItem = matchedQuery ?? leaderboard[0];

  const [trend, pages] = await Promise.all([
    runBigQueryQuery<QueryTrendPoint>(buildTrendQuery(selectedQueryItem.query)),
    runBigQueryQuery<QueryPageItem>(buildPageBreakdownQuery(selectedQueryItem.query)),
  ]);

  return {
    referenceEndDate: selectedQueryItem.reference_end_date,
    selectedQuery: selectedQueryItem,
    leaderboard,
    trend,
    pages,
    requestedSelectionMissing: false,
  };
}
