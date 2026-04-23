import assert from "node:assert/strict";
import test from "node:test";
import { pickSite } from "../scripts/lib/gsc-client.mjs";
import { getBigQueryRuntimeConfig, getSiteRuntimeConfig } from "../scripts/lib/runtime-config.mjs";

function withEnv(overrides, callback) {
  const previousEntries = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previousEntries.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previousEntries.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("runtime config exposes stable defaults for site and BigQuery", () => {
  withEnv(
    {
      APP_NAME: undefined,
      APP_SITE_DISPLAY_NAME: undefined,
      APP_SITE_DOMAIN: undefined,
      APP_SITE_ORIGIN: undefined,
      GSC_SITE_CANDIDATES: undefined,
      BIGQUERY_PROJECT_ID: undefined,
      GOOGLE_CLOUD_PROJECT: undefined,
      GCP_PROJECT_ID: undefined,
      BIGQUERY_RAW_DATASET: undefined,
      BIGQUERY_MART_DATASET: undefined,
      BIGQUERY_LOCATION: undefined,
    },
    () => {
      const siteConfig = getSiteRuntimeConfig();
      const bigQueryConfig = getBigQueryRuntimeConfig();

      assert.equal(siteConfig.appName, "SEO Analyzer");
      assert.equal(siteConfig.displayName, "Yoshilover.com");
      assert.equal(siteConfig.siteDomain, "yoshilover.com");
      assert.equal(siteConfig.canonicalOrigin, "https://yoshilover.com");
      assert.deepEqual(siteConfig.gscSiteCandidates, [
        "sc-domain:yoshilover.com",
        "https://yoshilover.com/",
        "http://yoshilover.com/",
      ]);

      assert.equal(bigQueryConfig.projectId, "baseballsite");
      assert.equal(bigQueryConfig.rawDatasetId, "seo_raw");
      assert.equal(bigQueryConfig.martDatasetId, "seo_mart");
      assert.equal(bigQueryConfig.location, "asia-northeast1");
    },
  );
});

test("runtime config honors environment overrides and GSC site selection", () => {
  withEnv(
    {
      APP_SITE_DOMAIN: "example.com",
      APP_SITE_ORIGIN: "https://example.com",
      GSC_SITE_CANDIDATES: "sc-domain:example.com,https://example.com/",
      BIGQUERY_PROJECT_ID: "seo-sandbox",
      BIGQUERY_RAW_DATASET: "raw_custom",
      BIGQUERY_MART_DATASET: "mart_custom",
      BIGQUERY_LOCATION: "us-central1",
    },
    () => {
      const siteConfig = getSiteRuntimeConfig();
      const bigQueryConfig = getBigQueryRuntimeConfig();

      assert.equal(siteConfig.siteDomain, "example.com");
      assert.deepEqual(siteConfig.gscSiteCandidates, [
        "sc-domain:example.com",
        "https://example.com/",
      ]);
      assert.equal(bigQueryConfig.projectId, "seo-sandbox");
      assert.equal(bigQueryConfig.rawDatasetId, "raw_custom");
      assert.equal(bigQueryConfig.martDatasetId, "mart_custom");
      assert.equal(bigQueryConfig.location, "us-central1");

      const chosenSite = pickSite([
        { siteUrl: "https://example.com/" },
        { siteUrl: "https://other-site.example/" },
      ]);

      assert.equal(chosenSite, "https://example.com/");
    },
  );
});
