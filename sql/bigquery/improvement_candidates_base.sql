CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_mart`
OPTIONS (
  location = "asia-northeast1",
  description = "Aggregated SEO marts for yoshilover.com"
);

CREATE OR REPLACE VIEW `baseballsite.seo_mart.improvement_candidates_base`
OPTIONS (
  description = "Base signal view for SEO improvement candidates using 7-day vs previous 7-day comparisons"
) AS
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM `baseballsite.seo_mart.page_daily`
),
page_periodized AS (
  SELECT
    p.page_path AS entity_key,
    p.canonical_url AS entity_label,
    CASE
      WHEN p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name,
    p.clicks,
    p.impressions,
    p.position,
    p.sessions,
    p.total_users,
    p.key_events
  FROM `baseballsite.seo_mart.page_daily` AS p
  CROSS JOIN anchor AS a
  WHERE p.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
page_aggregated AS (
  SELECT
    entity_key,
    entity_label,
    period_name,
    SUM(COALESCE(clicks, 0)) AS clicks,
    SUM(COALESCE(impressions, 0)) AS impressions,
    SAFE_DIVIDE(SUM(COALESCE(clicks, 0)), NULLIF(SUM(COALESCE(impressions, 0)), 0)) AS ctr,
    SAFE_DIVIDE(
      SUM(COALESCE(position, 0) * COALESCE(impressions, 0)),
      NULLIF(SUM(COALESCE(impressions, 0)), 0)
    ) AS position,
    SUM(COALESCE(sessions, 0)) AS sessions,
    SUM(COALESCE(total_users, 0)) AS total_users,
    SUM(COALESCE(key_events, 0)) AS key_events
  FROM page_periodized
  WHERE period_name IS NOT NULL
  GROUP BY entity_key, entity_label, period_name
),
page_signals AS (
  SELECT
    a.reference_end_date,
    "page" AS entity_type,
    COALESCE(c.entity_key, p.entity_key) AS entity_key,
    COALESCE(c.entity_label, p.entity_label) AS entity_label,
    NULL AS supporting_key,
    c.clicks AS current_clicks,
    p.clicks AS previous_clicks,
    COALESCE(c.clicks, 0) - COALESCE(p.clicks, 0) AS clicks_delta,
    c.impressions AS current_impressions,
    p.impressions AS previous_impressions,
    COALESCE(c.impressions, 0) - COALESCE(p.impressions, 0) AS impressions_delta,
    c.ctr AS current_ctr,
    p.ctr AS previous_ctr,
    COALESCE(c.ctr, 0) - COALESCE(p.ctr, 0) AS ctr_delta,
    c.position AS current_position,
    p.position AS previous_position,
    COALESCE(c.position, 0) - COALESCE(p.position, 0) AS position_delta,
    c.sessions AS current_sessions,
    p.sessions AS previous_sessions,
    COALESCE(c.sessions, 0) - COALESCE(p.sessions, 0) AS sessions_delta,
    c.total_users AS current_total_users,
    p.total_users AS previous_total_users,
    COALESCE(c.total_users, 0) - COALESCE(p.total_users, 0) AS total_users_delta,
    c.key_events AS current_key_events,
    p.key_events AS previous_key_events,
    COALESCE(c.key_events, 0) - COALESCE(p.key_events, 0) AS key_events_delta,
    NULL AS current_support_count,
    NULL AS previous_support_count,
    TRUE AS supports_rank_drop,
    TRUE AS supports_growth,
    TRUE AS supports_rewrite,
    FALSE AS supports_cannibal
  FROM anchor AS a
  LEFT JOIN page_aggregated AS c
    ON c.period_name = "current_7d"
  FULL OUTER JOIN page_aggregated AS p
    ON p.period_name = "previous_7d"
   AND c.entity_key = p.entity_key
),
query_support AS (
  SELECT
    q.query AS entity_key,
    q.query AS entity_label,
    CASE
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name,
    q.clicks,
    q.impressions,
    q.ctr,
    q.position,
    q.page_count
  FROM `baseballsite.seo_mart.query_daily` AS q
  CROSS JOIN anchor AS a
  WHERE q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
query_aggregated AS (
  SELECT
    entity_key,
    entity_label,
    period_name,
    SUM(COALESCE(clicks, 0)) AS clicks,
    SUM(COALESCE(impressions, 0)) AS impressions,
    SAFE_DIVIDE(SUM(COALESCE(clicks, 0)), NULLIF(SUM(COALESCE(impressions, 0)), 0)) AS ctr,
    SAFE_DIVIDE(
      SUM(COALESCE(position, 0) * COALESCE(impressions, 0)),
      NULLIF(SUM(COALESCE(impressions, 0)), 0)
    ) AS position,
    MAX(COALESCE(page_count, 0)) AS support_count
  FROM query_support
  WHERE period_name IS NOT NULL
  GROUP BY entity_key, entity_label, period_name
),
query_signals AS (
  SELECT
    a.reference_end_date,
    "query" AS entity_type,
    COALESCE(c.entity_key, p.entity_key) AS entity_key,
    COALESCE(c.entity_label, p.entity_label) AS entity_label,
    NULL AS supporting_key,
    c.clicks AS current_clicks,
    p.clicks AS previous_clicks,
    COALESCE(c.clicks, 0) - COALESCE(p.clicks, 0) AS clicks_delta,
    c.impressions AS current_impressions,
    p.impressions AS previous_impressions,
    COALESCE(c.impressions, 0) - COALESCE(p.impressions, 0) AS impressions_delta,
    c.ctr AS current_ctr,
    p.ctr AS previous_ctr,
    COALESCE(c.ctr, 0) - COALESCE(p.ctr, 0) AS ctr_delta,
    c.position AS current_position,
    p.position AS previous_position,
    COALESCE(c.position, 0) - COALESCE(p.position, 0) AS position_delta,
    NULL AS current_sessions,
    NULL AS previous_sessions,
    NULL AS sessions_delta,
    NULL AS current_total_users,
    NULL AS previous_total_users,
    NULL AS total_users_delta,
    NULL AS current_key_events,
    NULL AS previous_key_events,
    NULL AS key_events_delta,
    c.support_count AS current_support_count,
    p.support_count AS previous_support_count,
    FALSE AS supports_rank_drop,
    FALSE AS supports_growth,
    FALSE AS supports_rewrite,
    TRUE AS supports_cannibal
  FROM anchor AS a
  LEFT JOIN query_aggregated AS c
    ON c.period_name = "current_7d"
  FULL OUTER JOIN query_aggregated AS p
    ON p.period_name = "previous_7d"
   AND c.entity_key = p.entity_key
),
category_periodized AS (
  SELECT
    c.category_slug AS entity_key,
    COALESCE(c.category_url, c.category_slug) AS entity_label,
    c.category_type AS supporting_key,
    CASE
      WHEN c.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN c.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name,
    c.clicks,
    c.impressions,
    c.ctr,
    c.position,
    c.sessions,
    c.total_users,
    c.key_events,
    c.page_count
  FROM `baseballsite.seo_mart.category_daily` AS c
  CROSS JOIN anchor AS a
  WHERE c.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
category_aggregated AS (
  SELECT
    entity_key,
    entity_label,
    supporting_key,
    period_name,
    SUM(COALESCE(clicks, 0)) AS clicks,
    SUM(COALESCE(impressions, 0)) AS impressions,
    SAFE_DIVIDE(SUM(COALESCE(clicks, 0)), NULLIF(SUM(COALESCE(impressions, 0)), 0)) AS ctr,
    SAFE_DIVIDE(
      SUM(COALESCE(position, 0) * COALESCE(impressions, 0)),
      NULLIF(SUM(COALESCE(impressions, 0)), 0)
    ) AS position,
    SUM(COALESCE(sessions, 0)) AS sessions,
    SUM(COALESCE(total_users, 0)) AS total_users,
    SUM(COALESCE(key_events, 0)) AS key_events,
    MAX(COALESCE(page_count, 0)) AS support_count
  FROM category_periodized
  WHERE period_name IS NOT NULL
  GROUP BY entity_key, entity_label, supporting_key, period_name
),
category_signals AS (
  SELECT
    a.reference_end_date,
    "category" AS entity_type,
    COALESCE(c.entity_key, p.entity_key) AS entity_key,
    COALESCE(c.entity_label, p.entity_label) AS entity_label,
    COALESCE(c.supporting_key, p.supporting_key) AS supporting_key,
    c.clicks AS current_clicks,
    p.clicks AS previous_clicks,
    COALESCE(c.clicks, 0) - COALESCE(p.clicks, 0) AS clicks_delta,
    c.impressions AS current_impressions,
    p.impressions AS previous_impressions,
    COALESCE(c.impressions, 0) - COALESCE(p.impressions, 0) AS impressions_delta,
    c.ctr AS current_ctr,
    p.ctr AS previous_ctr,
    COALESCE(c.ctr, 0) - COALESCE(p.ctr, 0) AS ctr_delta,
    c.position AS current_position,
    p.position AS previous_position,
    COALESCE(c.position, 0) - COALESCE(p.position, 0) AS position_delta,
    c.sessions AS current_sessions,
    p.sessions AS previous_sessions,
    COALESCE(c.sessions, 0) - COALESCE(p.sessions, 0) AS sessions_delta,
    c.total_users AS current_total_users,
    p.total_users AS previous_total_users,
    COALESCE(c.total_users, 0) - COALESCE(p.total_users, 0) AS total_users_delta,
    c.key_events AS current_key_events,
    p.key_events AS previous_key_events,
    COALESCE(c.key_events, 0) - COALESCE(p.key_events, 0) AS key_events_delta,
    c.support_count AS current_support_count,
    p.support_count AS previous_support_count,
    TRUE AS supports_rank_drop,
    TRUE AS supports_growth,
    FALSE AS supports_rewrite,
    FALSE AS supports_cannibal
  FROM anchor AS a
  LEFT JOIN category_aggregated AS c
    ON c.period_name = "current_7d"
  FULL OUTER JOIN category_aggregated AS p
    ON p.period_name = "previous_7d"
   AND c.entity_key = p.entity_key
)
SELECT *
FROM page_signals
UNION ALL
SELECT *
FROM query_signals
UNION ALL
SELECT *
FROM category_signals;
