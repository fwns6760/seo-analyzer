import "server-only";

import { runBigQueryQuery } from "@/utils/bigquery";

export type ArticleLeaderboardItem = {
  reference_end_date: string;
  page_path: string;
  canonical_url: string;
  current_clicks: number;
  previous_clicks: number;
  clicks_delta: number;
  current_impressions: number;
  previous_impressions: number;
  current_ctr: number | null;
  previous_ctr: number | null;
  current_position: number | null;
  previous_position: number | null;
  current_sessions: number;
  previous_sessions: number;
  current_total_users: number;
  previous_total_users: number;
  tracked_days: number;
};

export type ArticleTrendPoint = {
  reference_end_date: string;
  data_date: string;
  page_path: string;
  canonical_url: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  sessions: number | null;
  total_users: number | null;
  key_events: number | null;
  source_match_status: string;
  has_gsc_row: boolean;
  has_ga4_row: boolean;
};

export type ArticleQueryItem = {
  reference_end_date: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  active_days: number;
};

export type ArticleAnalysisData = {
  referenceEndDate: string | null;
  selectedPage: ArticleLeaderboardItem | null;
  leaderboard: ArticleLeaderboardItem[];
  trend: ArticleTrendPoint[];
  queries: ArticleQueryItem[];
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
  FROM ${martTable("page_daily")}
),
periodized AS (
  SELECT
    a.reference_end_date,
    p.data_date,
    p.page_path,
    p.canonical_url,
    p.clicks,
    p.impressions,
    p.position,
    p.sessions,
    p.total_users,
    CASE
      WHEN p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name
  FROM ${martTable("page_daily")} AS p
  CROSS JOIN anchor AS a
  WHERE p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
aggregated AS (
  SELECT
    reference_end_date,
    page_path,
    canonical_url,
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
    SUM(IF(period_name = "current_7d", COALESCE(sessions, 0), 0)) AS current_sessions,
    SUM(IF(period_name = "previous_7d", COALESCE(sessions, 0), 0)) AS previous_sessions,
    SUM(IF(period_name = "current_7d", COALESCE(total_users, 0), 0)) AS current_total_users,
    SUM(IF(period_name = "previous_7d", COALESCE(total_users, 0), 0)) AS previous_total_users,
    COUNT(DISTINCT IF(period_name = "current_7d", data_date, NULL)) AS tracked_days
  FROM periodized
  WHERE period_name IS NOT NULL
  GROUP BY reference_end_date, page_path, canonical_url
)
SELECT
  reference_end_date,
  page_path,
  canonical_url,
  current_clicks,
  previous_clicks,
  current_clicks - previous_clicks AS clicks_delta,
  current_impressions,
  previous_impressions,
  current_ctr,
  previous_ctr,
  current_position,
  previous_position,
  current_sessions,
  previous_sessions,
  current_total_users,
  previous_total_users,
  tracked_days
FROM aggregated
ORDER BY current_clicks DESC, current_impressions DESC, page_path ASC
LIMIT 30
`;

function buildTrendQuery(pagePath: string) {
  const escapedPagePath = escapeSqlString(pagePath);

  return `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("page_daily")}
)
SELECT
  a.reference_end_date,
  p.data_date,
  p.page_path,
  p.canonical_url,
  p.clicks,
  p.impressions,
  p.ctr,
  p.position,
  p.sessions,
  p.total_users,
  p.key_events,
  p.source_match_status,
  p.has_gsc_row,
  p.has_ga4_row
FROM ${martTable("page_daily")} AS p
CROSS JOIN anchor AS a
WHERE p.page_path = '${escapedPagePath}'
  AND p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
ORDER BY p.data_date DESC
`;
}

function buildQueryBreakdownQuery(pagePath: string) {
  const escapedPagePath = escapeSqlString(pagePath);

  return `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("page_daily")}
),
normalized_page_queries AS (
  SELECT
    data_date,
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
    query,
    clicks,
    impressions,
    position
  FROM ${rawTable("raw_gsc")}
  WHERE grain = "page_query_daily"
    AND page IS NOT NULL
    AND query IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY data_date, site_url, query, page
    ORDER BY fetched_at DESC, batch_id DESC
  ) = 1
)
SELECT
  a.reference_end_date,
  q.query,
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
WHERE q.page_path = '${escapedPagePath}'
  AND q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
GROUP BY a.reference_end_date, q.query
ORDER BY clicks DESC, impressions DESC, q.query ASC
LIMIT 20
`;
}

export async function getArticleAnalysisData(selectedPagePath: string | null): Promise<ArticleAnalysisData> {
  const leaderboard = await runBigQueryQuery<ArticleLeaderboardItem>(leaderboardQuery);

  if (leaderboard.length === 0) {
    return {
      referenceEndDate: null,
      selectedPage: null,
      leaderboard,
      trend: [],
      queries: [],
    };
  }

  const selectedPage =
    leaderboard.find((item) => item.page_path === selectedPagePath) ?? leaderboard[0];

  const [trend, queries] = await Promise.all([
    runBigQueryQuery<ArticleTrendPoint>(buildTrendQuery(selectedPage.page_path)),
    runBigQueryQuery<ArticleQueryItem>(buildQueryBreakdownQuery(selectedPage.page_path)),
  ]);

  return {
    referenceEndDate: selectedPage.reference_end_date,
    selectedPage,
    leaderboard,
    trend,
    queries,
  };
}
