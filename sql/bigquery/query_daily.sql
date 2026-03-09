CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_mart`
OPTIONS (
  location = "asia-northeast1",
  description = "Aggregated SEO marts for yoshilover.com"
);

CREATE OR REPLACE VIEW `baseballsite.seo_mart.query_daily`
OPTIONS (
  description = "Daily query-level SEO view built from Search Console query metrics and page-query rollups"
) AS
WITH gsc_query_daily AS (
  SELECT
    data_date,
    site_url,
    query,
    clicks,
    impressions,
    ctr,
    position
  FROM `baseballsite.seo_raw.raw_gsc`
  WHERE grain = "query_daily"
    AND query IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY data_date, site_url, query
    ORDER BY fetched_at DESC, batch_id DESC
  ) = 1
),
gsc_page_query_ranked AS (
  SELECT
    data_date,
    query,
    page,
    clicks,
    impressions,
    ROW_NUMBER() OVER (
      PARTITION BY data_date, query
      ORDER BY clicks DESC, impressions DESC, page ASC
    ) AS page_rank
  FROM `baseballsite.seo_raw.raw_gsc`
  WHERE grain = "page_query_daily"
    AND query IS NOT NULL
    AND page IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY data_date, site_url, query, page
    ORDER BY fetched_at DESC, batch_id DESC
  ) = 1
),
gsc_page_query_rollup AS (
  SELECT
    data_date,
    query,
    COUNT(DISTINCT page) AS page_count,
    MAX(IF(page_rank = 1, page, NULL)) AS top_page_url,
    MAX(
      IF(
        page_rank = 1,
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
        ),
        NULL
      )
    ) AS top_page_path,
    MAX(IF(page_rank = 1, clicks, NULL)) AS top_page_clicks,
    MAX(IF(page_rank = 1, impressions, NULL)) AS top_page_impressions
  FROM gsc_page_query_ranked
  GROUP BY data_date, query
)
SELECT
  q.data_date,
  q.site_url,
  q.query,
  q.clicks,
  q.impressions,
  q.ctr,
  q.position,
  COALESCE(r.page_count, 0) AS page_count,
  r.top_page_url,
  r.top_page_path,
  CASE
    WHEN r.top_page_path = "/" THEN "https://yoshilover.com/"
    WHEN r.top_page_path IS NULL THEN NULL
    ELSE CONCAT("https://yoshilover.com", r.top_page_path)
  END AS top_page_canonical_url,
  r.top_page_clicks,
  r.top_page_impressions,
  COALESCE(r.page_count, 0) >= 2 AS has_multiple_pages
FROM gsc_query_daily AS q
LEFT JOIN gsc_page_query_rollup AS r
  ON q.data_date = r.data_date
 AND q.query = r.query;
