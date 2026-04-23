import runtimeDefaults from "@/config/runtime-defaults.json";

function readStringEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readStringListEnv(name: string, fallback: string[]) {
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

function readNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrigin(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function firstDefinedString(values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

const defaultOwnerEmails = runtimeDefaults.owner.emails.map((email) => email.trim().toLowerCase());
const configuredOwnerEmails = readStringListEnv("OWNER_EMAILS", defaultOwnerEmails).map((email) =>
  email.trim().toLowerCase(),
);
const siteDomain = readStringEnv("APP_SITE_DOMAIN", runtimeDefaults.site.domain);
const canonicalOrigin = normalizeOrigin(
  readStringEnv("APP_SITE_ORIGIN", runtimeDefaults.site.canonicalOrigin),
);

export const appConfig = {
  appName: readStringEnv("APP_NAME", runtimeDefaults.site.appName),
  siteDisplayName: readStringEnv("APP_SITE_DISPLAY_NAME", runtimeDefaults.site.displayName),
  siteDomain,
  canonicalOrigin,
  description: `${siteDomain} SEO analysis dashboard`,
  gscSiteCandidates: readStringListEnv("GSC_SITE_CANDIDATES", runtimeDefaults.site.gscSiteCandidates),
  ga4TargetDomain: readStringEnv("GA4_TARGET_DOMAIN", siteDomain),
};

export const ownerConfig = {
  emails: configuredOwnerEmails.length > 0 ? configuredOwnerEmails : defaultOwnerEmails,
  primaryEmail: configuredOwnerEmails[0] ?? defaultOwnerEmails[0],
};

export const bigQueryConfig = {
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

export function buildCanonicalUrl(path: string) {
  const normalizedPath =
    path === "/" ? "/" : `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;

  return normalizedPath === "/"
    ? `${appConfig.canonicalOrigin}/`
    : `${appConfig.canonicalOrigin}${normalizedPath}`;
}

const defaultThresholds = runtimeDefaults.opportunities;

export const opportunityThresholds = {
  rankDrop: {
    previousImpressionsMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_PREVIOUS_IMPRESSIONS_MIN",
      defaultThresholds.rankDrop.previousImpressionsMin,
    ),
    previousPositionMax: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_PREVIOUS_POSITION_MAX",
      defaultThresholds.rankDrop.previousPositionMax,
    ),
    positionDeltaMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_POSITION_DELTA_MIN",
      defaultThresholds.rankDrop.positionDeltaMin,
    ),
    previousClicksMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_PREVIOUS_CLICKS_MIN",
      defaultThresholds.rankDrop.previousClicksMin,
    ),
    clicksDeltaMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_CLICKS_DELTA_MIN",
      defaultThresholds.rankDrop.clicksDeltaMin,
    ),
    clicksLossRateMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_CLICKS_LOSS_RATE_MIN",
      defaultThresholds.rankDrop.clicksLossRateMin,
    ),
    previousSessionsMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_PREVIOUS_SESSIONS_MIN",
      defaultThresholds.rankDrop.previousSessionsMin,
    ),
    sessionsDeltaMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_SESSIONS_DELTA_MIN",
      defaultThresholds.rankDrop.sessionsDeltaMin,
    ),
    sessionsLossRateMin: readNumberEnv(
      "OPPORTUNITY_RANK_DROP_SESSIONS_LOSS_RATE_MIN",
      defaultThresholds.rankDrop.sessionsLossRateMin,
    ),
  },
  growth: {
    currentImpressionsMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_CURRENT_IMPRESSIONS_MIN",
      defaultThresholds.growth.currentImpressionsMin,
    ),
    currentPositionMax: readNumberEnv(
      "OPPORTUNITY_GROWTH_CURRENT_POSITION_MAX",
      defaultThresholds.growth.currentPositionMax,
    ),
    previousClicksMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_PREVIOUS_CLICKS_MIN",
      defaultThresholds.growth.previousClicksMin,
    ),
    clicksDeltaMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_CLICKS_DELTA_MIN",
      defaultThresholds.growth.clicksDeltaMin,
    ),
    clicksGainRateMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_CLICKS_GAIN_RATE_MIN",
      defaultThresholds.growth.clicksGainRateMin,
    ),
    previousSessionsMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_PREVIOUS_SESSIONS_MIN",
      defaultThresholds.growth.previousSessionsMin,
    ),
    sessionsDeltaMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_SESSIONS_DELTA_MIN",
      defaultThresholds.growth.sessionsDeltaMin,
    ),
    sessionsGainRateMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_SESSIONS_GAIN_RATE_MIN",
      defaultThresholds.growth.sessionsGainRateMin,
    ),
    positionDeltaMax: readNumberEnv(
      "OPPORTUNITY_GROWTH_POSITION_DELTA_MAX",
      defaultThresholds.growth.positionDeltaMax,
    ),
    impressionsDeltaMin: readNumberEnv(
      "OPPORTUNITY_GROWTH_IMPRESSIONS_DELTA_MIN",
      defaultThresholds.growth.impressionsDeltaMin,
    ),
  },
  rewrite: {
    currentImpressionsMin: readNumberEnv(
      "OPPORTUNITY_REWRITE_CURRENT_IMPRESSIONS_MIN",
      defaultThresholds.rewrite.currentImpressionsMin,
    ),
    currentPositionMin: readNumberEnv(
      "OPPORTUNITY_REWRITE_CURRENT_POSITION_MIN",
      defaultThresholds.rewrite.currentPositionMin,
    ),
    currentPositionMax: readNumberEnv(
      "OPPORTUNITY_REWRITE_CURRENT_POSITION_MAX",
      defaultThresholds.rewrite.currentPositionMax,
    ),
    currentCtrMax: readNumberEnv(
      "OPPORTUNITY_REWRITE_CURRENT_CTR_MAX",
      defaultThresholds.rewrite.currentCtrMax,
    ),
  },
  cannibal: {
    currentSupportCountMin: readNumberEnv(
      "OPPORTUNITY_CANNIBAL_CURRENT_SUPPORT_COUNT_MIN",
      defaultThresholds.cannibal.currentSupportCountMin,
    ),
    currentImpressionsMin: readNumberEnv(
      "OPPORTUNITY_CANNIBAL_CURRENT_IMPRESSIONS_MIN",
      defaultThresholds.cannibal.currentImpressionsMin,
    ),
    currentPositionMax: readNumberEnv(
      "OPPORTUNITY_CANNIBAL_CURRENT_POSITION_MAX",
      defaultThresholds.cannibal.currentPositionMax,
    ),
  },
};
