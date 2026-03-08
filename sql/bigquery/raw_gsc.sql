CREATE SCHEMA IF NOT EXISTS `baseballsite.seo_raw`
OPTIONS (
  location = "asia-northeast1",
  description = "Raw SEO source tables for yoshilover.com"
);

CREATE TABLE IF NOT EXISTS `baseballsite.seo_raw.raw_gsc` (
  fetched_at TIMESTAMP NOT NULL OPTIONS (
    description = "Timestamp when the batch fetched this row from the Search Console API"
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
  site_url STRING NOT NULL OPTIONS (
    description = "Search Console property used for the request, e.g. https://yoshilover.com/"
  ),
  data_date DATE NOT NULL OPTIONS (
    description = "Daily data date returned by the Search Console API"
  ),
  grain STRING NOT NULL OPTIONS (
    description = "Aggregation grain: site_daily, page_daily, query_daily, or page_query_daily"
  ),
  page STRING OPTIONS (
    description = "Landing page URL returned by GSC. NULL for site_daily and query_daily"
  ),
  query STRING OPTIONS (
    description = "Search query returned by GSC. NULL for site_daily and page_daily"
  ),
  country STRING OPTIONS (
    description = "Country dimension if requested. NULL in MVP initial fetches"
  ),
  device STRING OPTIONS (
    description = "Device dimension if requested. NULL in MVP initial fetches"
  ),
  search_type STRING NOT NULL OPTIONS (
    description = "Search type used in the request. MVP default is web"
  ),
  clicks INT64 NOT NULL OPTIONS (
    description = "Search Console clicks metric"
  ),
  impressions INT64 NOT NULL OPTIONS (
    description = "Search Console impressions metric"
  ),
  ctr FLOAT64 NOT NULL OPTIONS (
    description = "Search Console CTR metric"
  ),
  position FLOAT64 NOT NULL OPTIONS (
    description = "Search Console average position metric"
  )
)
PARTITION BY data_date
CLUSTER BY site_url, grain, page, query
OPTIONS (
  description = "Raw daily Google Search Console metrics for yoshilover.com across multiple grains"
);

-- Example uniqueness expectation for downstream deduplication:
-- (site_url, data_date, grain, page, query, country, device, search_type, batch_id)
