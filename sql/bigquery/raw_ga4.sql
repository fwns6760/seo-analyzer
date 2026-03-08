CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_raw`
OPTIONS (
  location = "asia-northeast1",
  description = "Raw SEO source tables for yoshilover.com"
);

CREATE TABLE IF NOT EXISTS `baseballsite.seo_raw.raw_ga4` (
  fetched_at TIMESTAMP NOT NULL OPTIONS (
    description = "Timestamp when the batch fetched this row from the GA4 APIs"
  ),
  batch_id STRING NOT NULL OPTIONS (
    description = "Identifier of the batch execution that inserted this row"
  ),
  source_start_date DATE NOT NULL OPTIONS (
    description = "API request startDate used for this fetch"
  ),
  source_end_date DATE NOT NULL OPTIONS (
    description = "API request endDate used for this fetch"
  ),
  property_id STRING NOT NULL OPTIONS (
    description = "GA4 property identifier, e.g. properties/260608310"
  ),
  web_stream_default_uri STRING OPTIONS (
    description = "GA4 web stream default URI used to map the property to the site"
  ),
  data_date DATE NOT NULL OPTIONS (
    description = "Daily data date returned by the GA4 Data API"
  ),
  grain STRING NOT NULL OPTIONS (
    description = "Aggregation grain: site_daily or landing_page_daily"
  ),
  landing_page STRING OPTIONS (
    description = "Landing page URL or path for Organic Search sessions. NULL for site_daily"
  ),
  session_default_channel_group STRING NOT NULL OPTIONS (
    description = "Channel group filter used in the request. MVP default is Organic Search"
  ),
  sessions INT64 NOT NULL OPTIONS (
    description = "GA4 sessions metric"
  ),
  total_users INT64 NOT NULL OPTIONS (
    description = "GA4 totalUsers metric"
  ),
  key_events FLOAT64 OPTIONS (
    description = "GA4 keyEvents metric. Nullable until the primary key event definition is fixed"
  )
)
PARTITION BY data_date
CLUSTER BY property_id, grain, landing_page
OPTIONS (
  description = "Raw daily GA4 Organic Search metrics for yoshilover.com across multiple grains"
);

-- Example uniqueness expectation for downstream deduplication:
-- (property_id, data_date, grain, landing_page, session_default_channel_group, batch_id)
