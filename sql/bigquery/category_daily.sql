CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_mart`
OPTIONS (
  location = "asia-northeast1",
  description = "Aggregated SEO marts for yoshilover.com"
);

CREATE OR REPLACE VIEW `baseballsite.seo_mart.category_daily`
OPTIONS (
  description = "Daily category-level SEO view aggregated from page_daily using URL prefix category mapping"
) AS
WITH categorized_pages AS (
  SELECT
    data_date,
    page_path,
    canonical_url,
    clicks,
    impressions,
    position,
    sessions,
    total_users,
    key_events,
    has_gsc_row,
    has_ga4_row,
    CASE
      WHEN page_path = "/" THEN "home"
      WHEN REGEXP_CONTAINS(page_path, r"^/category/[^/]+(?:/|$)") THEN REGEXP_EXTRACT(page_path, r"^/category/([^/]+)")
      ELSE "uncategorized"
    END AS category_slug,
    CASE
      WHEN page_path = "/" THEN "site_root"
      WHEN REGEXP_CONTAINS(page_path, r"^/category/[^/]+(?:/|$)") THEN "wordpress_category"
      ELSE "uncategorized"
    END AS category_type
  FROM `baseballsite.seo_mart.page_daily`
)
SELECT
  data_date,
  category_slug,
  category_type,
  CASE
    WHEN category_slug = "home" THEN "https://yoshilover.com/"
    WHEN category_type = "wordpress_category" THEN CONCAT("https://yoshilover.com/category/", category_slug, "/")
    ELSE NULL
  END AS category_url,
  COUNT(DISTINCT page_path) AS page_count,
  COUNT(DISTINCT IF(has_gsc_row, page_path, NULL)) AS gsc_page_count,
  COUNT(DISTINCT IF(has_ga4_row, page_path, NULL)) AS ga4_page_count,
  COUNT(DISTINCT IF(has_gsc_row AND has_ga4_row, page_path, NULL)) AS matched_page_count,
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
FROM categorized_pages
GROUP BY data_date, category_slug, category_type, category_url;
