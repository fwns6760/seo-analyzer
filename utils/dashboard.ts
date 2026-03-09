import "server-only";

import { runBigQueryQuery } from "@/utils/bigquery";

export type DashboardOverview = {
  reference_end_date: string;
  earliest_date: string;
  latest_date: string;
  active_days: number;
  current_clicks: number;
  previous_clicks: number;
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
  current_key_events: number;
  previous_key_events: number;
  current_matched_pages: number;
  previous_matched_pages: number;
};

export type DashboardOpportunity = {
  reference_end_date: string;
  entity_key: string;
  entity_label: string;
  current_clicks: number | null;
  previous_clicks: number | null;
  clicks_delta: number;
  current_impressions: number | null;
  current_ctr: number | null;
  current_position: number | null;
  previous_position: number | null;
  position_delta: number | null;
  current_sessions: number | null;
  previous_sessions: number | null;
  sessions_delta: number | null;
};

export type DashboardTopPage = {
  reference_end_date: string;
  page_path: string;
  canonical_url: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  sessions: number;
  total_users: number;
};

export type DashboardData = {
  overview: DashboardOverview | null;
  growthItems: DashboardOpportunity[];
  rankDropItems: DashboardOpportunity[];
  rewriteItems: DashboardOpportunity[];
  topPages: DashboardTopPage[];
};

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCP_PROJECT_ID ??
  process.env.BIGQUERY_PROJECT_ID ??
  "baseballsite";

const martDataset = process.env.BIGQUERY_MART_DATASET ?? "seo_mart";

function martTable(tableName: string) {
  return `\`${projectId}.${martDataset}.${tableName}\``;
}

const overviewQuery = `
WITH anchor AS (
  SELECT
    MIN(data_date) AS earliest_date,
    MAX(data_date) AS latest_date,
    COUNT(DISTINCT data_date) AS active_days
  FROM ${martTable("page_daily")}
),
periodized AS (
  SELECT
    a.earliest_date,
    a.latest_date,
    a.latest_date AS reference_end_date,
    a.active_days,
    p.page_path,
    p.clicks,
    p.impressions,
    p.position,
    p.sessions,
    p.total_users,
    p.key_events,
    p.has_gsc_row,
    p.has_ga4_row,
    CASE
      WHEN p.data_date BETWEEN DATE_SUB(a.latest_date, INTERVAL 6 DAY) AND a.latest_date THEN "current_7d"
      WHEN p.data_date BETWEEN DATE_SUB(a.latest_date, INTERVAL 13 DAY) AND DATE_SUB(a.latest_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name
  FROM ${martTable("page_daily")} AS p
  CROSS JOIN anchor AS a
  WHERE p.data_date BETWEEN DATE_SUB(a.latest_date, INTERVAL 13 DAY) AND a.latest_date
)
SELECT
  reference_end_date,
  earliest_date,
  latest_date,
  active_days,
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
  SUM(IF(period_name = "current_7d", COALESCE(key_events, 0), 0)) AS current_key_events,
  SUM(IF(period_name = "previous_7d", COALESCE(key_events, 0), 0)) AS previous_key_events,
  COUNT(DISTINCT IF(period_name = "current_7d" AND has_gsc_row AND has_ga4_row, page_path, NULL)) AS current_matched_pages,
  COUNT(DISTINCT IF(period_name = "previous_7d" AND has_gsc_row AND has_ga4_row, page_path, NULL)) AS previous_matched_pages
FROM periodized
WHERE period_name IS NOT NULL
GROUP BY reference_end_date, earliest_date, latest_date, active_days
`;

const growthQuery = `
SELECT
  reference_end_date,
  entity_key,
  entity_label,
  current_clicks,
  previous_clicks,
  clicks_delta,
  current_impressions,
  current_ctr,
  current_position,
  previous_position,
  position_delta,
  current_sessions,
  previous_sessions,
  sessions_delta
FROM ${martTable("improvement_candidates_base")}
WHERE entity_type = "page"
  AND reference_end_date IS NOT NULL
  AND current_clicks IS NOT NULL
ORDER BY clicks_delta DESC, current_sessions DESC, current_impressions DESC
LIMIT 5
`;

const rankDropQuery = `
SELECT
  reference_end_date,
  entity_key,
  entity_label,
  current_clicks,
  previous_clicks,
  clicks_delta,
  current_impressions,
  current_ctr,
  current_position,
  previous_position,
  position_delta,
  current_sessions,
  previous_sessions,
  sessions_delta
FROM ${martTable("improvement_candidates_base")}
WHERE entity_type = "page"
  AND reference_end_date IS NOT NULL
  AND current_clicks IS NOT NULL
  AND previous_clicks IS NOT NULL
  AND (position_delta > 0.5 OR clicks_delta < 0)
ORDER BY position_delta DESC, clicks_delta ASC, previous_clicks DESC
LIMIT 5
`;

const rewriteQuery = `
SELECT
  reference_end_date,
  entity_key,
  entity_label,
  current_clicks,
  previous_clicks,
  clicks_delta,
  current_impressions,
  current_ctr,
  current_position,
  previous_position,
  position_delta,
  current_sessions,
  previous_sessions,
  sessions_delta
FROM ${martTable("improvement_candidates_base")}
WHERE entity_type = "page"
  AND reference_end_date IS NOT NULL
  AND current_impressions >= 80
  AND current_position BETWEEN 6 AND 20
  AND current_ctr < 0.12
ORDER BY current_impressions DESC, current_position ASC
LIMIT 5
`;

const topPagesQuery = `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM ${martTable("page_daily")}
),
current_pages AS (
  SELECT
    p.page_path,
    p.canonical_url,
    SUM(COALESCE(p.clicks, 0)) AS clicks,
    SUM(COALESCE(p.impressions, 0)) AS impressions,
    SAFE_DIVIDE(SUM(COALESCE(p.clicks, 0)), NULLIF(SUM(COALESCE(p.impressions, 0)), 0)) AS ctr,
    SAFE_DIVIDE(
      SUM(COALESCE(p.position, 0) * COALESCE(p.impressions, 0)),
      NULLIF(SUM(COALESCE(p.impressions, 0)), 0)
    ) AS position,
    SUM(COALESCE(p.sessions, 0)) AS sessions,
    SUM(COALESCE(p.total_users, 0)) AS total_users
  FROM ${martTable("page_daily")} AS p
  CROSS JOIN anchor AS a
  WHERE p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date
  GROUP BY p.page_path, p.canonical_url
)
SELECT
  a.reference_end_date,
  c.page_path,
  c.canonical_url,
  c.clicks,
  c.impressions,
  c.ctr,
  c.position,
  c.sessions,
  c.total_users
FROM current_pages AS c
CROSS JOIN anchor AS a
ORDER BY c.clicks DESC, c.impressions DESC
LIMIT 8
`;

export async function getDashboardData(): Promise<DashboardData> {
  const [overviewRows, growthItems, rankDropItems, rewriteItems, topPages] = await Promise.all([
    runBigQueryQuery<DashboardOverview>(overviewQuery),
    runBigQueryQuery<DashboardOpportunity>(growthQuery),
    runBigQueryQuery<DashboardOpportunity>(rankDropQuery),
    runBigQueryQuery<DashboardOpportunity>(rewriteQuery),
    runBigQueryQuery<DashboardTopPage>(topPagesQuery),
  ]);

  return {
    overview: overviewRows[0] ?? null,
    growthItems,
    rankDropItems,
    rewriteItems,
    topPages,
  };
}
