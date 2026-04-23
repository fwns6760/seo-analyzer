import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimeDefaults = require("../../config/runtime-defaults.json");

function readStringEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readStringListEnv(name, fallback) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function firstDefinedString(values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

export function getSiteRuntimeConfig() {
  const siteDomain = readStringEnv("APP_SITE_DOMAIN", runtimeDefaults.site.domain);

  return {
    appName: readStringEnv("APP_NAME", runtimeDefaults.site.appName),
    displayName: readStringEnv("APP_SITE_DISPLAY_NAME", runtimeDefaults.site.displayName),
    siteDomain,
    canonicalOrigin: readStringEnv("APP_SITE_ORIGIN", runtimeDefaults.site.canonicalOrigin),
    gscSiteCandidates: readStringListEnv(
      "GSC_SITE_CANDIDATES",
      runtimeDefaults.site.gscSiteCandidates,
    ),
    ga4TargetDomain: readStringEnv("GA4_TARGET_DOMAIN", siteDomain),
  };
}

export function getBigQueryRuntimeConfig() {
  return {
    projectId:
      firstDefinedString([
        process.env.BIGQUERY_PROJECT_ID,
        process.env.GOOGLE_CLOUD_PROJECT,
        process.env.GCP_PROJECT_ID,
      ]) ?? runtimeDefaults.bigquery.projectId,
    rawDatasetId: readStringEnv("BIGQUERY_RAW_DATASET", runtimeDefaults.bigquery.rawDataset),
    martDatasetId: readStringEnv("BIGQUERY_MART_DATASET", runtimeDefaults.bigquery.martDataset),
    location: readStringEnv("BIGQUERY_LOCATION", runtimeDefaults.bigquery.location),
  };
}
