CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_mart`
OPTIONS (
  location = "asia-northeast1",
  description = "Aggregated SEO marts for yoshilover.com"
);

CREATE OR REPLACE VIEW `baseballsite.seo_mart.page_daily`
OPTIONS (
  description = "Daily page-level SEO view joining GSC page metrics with GA4 Organic Search landing page metrics"
) AS
WITH gsc_page_daily AS (
  SELECT
    data_date,
    site_url,
    page AS gsc_page_url,
    CASE
      WHEN page IS NULL THEN NULL
      ELSE COALESCE(
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
      )
    END AS normalized_page_path,
    clicks,
    impressions,
    ctr,
    position
  FROM `baseballsite.seo_raw.raw_gsc`
  WHERE grain = "page_daily"
),
ga4_landing_page_daily AS (
  SELECT
    data_date,
    property_id,
    web_stream_default_uri,
    landing_page AS ga4_landing_page,
    CASE
      WHEN landing_page IS NULL THEN NULL
      ELSE COALESCE(
        NULLIF(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(landing_page, r"^https?://[^/]+", ""),
              r"[?#].*$",
              ""
            ),
            r"/$",
            ""
          ),
          ""
        ),
        "/"
      )
    END AS normalized_page_path,
    sessions,
    total_users,
    key_events
  FROM `baseballsite.seo_raw.raw_ga4`
  WHERE grain = "landing_page_daily"
    AND session_default_channel_group = "Organic Search"
),
joined AS (
  SELECT
    COALESCE(g.data_date, a.data_date) AS data_date,
    COALESCE(g.normalized_page_path, a.normalized_page_path) AS page_path,
    g.site_url,
    a.property_id,
    a.web_stream_default_uri,
    g.gsc_page_url,
    a.ga4_landing_page,
    g.clicks,
    g.impressions,
    g.ctr,
    g.position,
    a.sessions,
    a.total_users,
    a.key_events,
    g.gsc_page_url IS NOT NULL AS has_gsc_row,
    a.ga4_landing_page IS NOT NULL AS has_ga4_row
  FROM gsc_page_daily AS g
  FULL OUTER JOIN ga4_landing_page_daily AS a
    ON g.data_date = a.data_date
   AND g.normalized_page_path = a.normalized_page_path
)
SELECT
  data_date,
  page_path,
  CASE
    WHEN page_path = "/" THEN "https://yoshilover.com/"
    WHEN page_path IS NULL THEN NULL
    ELSE CONCAT("https://yoshilover.com", page_path)
  END AS canonical_url,
  site_url,
  property_id,
  web_stream_default_uri,
  gsc_page_url,
  ga4_landing_page,
  clicks,
  impressions,
  ctr,
  position,
  sessions,
  total_users,
  key_events,
  has_gsc_row,
  has_ga4_row,
  CASE
    WHEN has_gsc_row AND has_ga4_row THEN "both"
    WHEN has_gsc_row THEN "gsc_only"
    WHEN has_ga4_row THEN "ga4_only"
    ELSE "unknown"
  END AS source_match_status
FROM joined
WHERE page_path IS NOT NULL;
