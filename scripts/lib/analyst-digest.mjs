import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { runQuery } from "./bigquery-client.mjs";

export const comparisonWindowDays = 14;

const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery";
const digestLimit = 5;
const require = createRequire(import.meta.url);
const runtimeDefaults = require("../../config/runtime-defaults.json");
const opportunityThresholds = runtimeDefaults.opportunities;

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function addDaysToDateString(value, days) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day + days));

  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate(),
  )}`;
}

function clampNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeNullableNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function roundRate(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

function metricSummary(currentValue, previousValue) {
  const current = normalizeNullableNumber(currentValue);
  const previous = normalizeNullableNumber(previousValue);

  if (current === null && previous === null) {
    return {
      current: null,
      previous: null,
      delta: null,
      delta_rate: null,
    };
  }

  const normalizedCurrent = current ?? 0;
  const normalizedPrevious = previous ?? 0;
  const delta = normalizedCurrent - normalizedPrevious;

  return {
    current: normalizedCurrent,
    previous: normalizedPrevious,
    delta,
    delta_rate: normalizedPrevious === 0 ? null : roundRate(delta / normalizedPrevious),
  };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function formatSignedNumber(value, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const number = digits > 0 ? Number(value).toFixed(digits) : String(Math.round(value));
  return value > 0 ? `+${number}` : number;
}

function formatMetricLine(label, metric, suffix = "") {
  if (metric.current === null && metric.previous === null) {
    return `${label}: -`;
  }

  const current = metric.current ?? 0;
  const delta = metric.delta ?? 0;
  const rate = metric.delta_rate;

  return `${label}: ${current}${suffix} (${formatSignedNumber(delta)}${suffix}${
    rate === null ? "" : ` / ${formatPercent(rate)}`
  })`;
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function normalizePageLabel(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (!looksLikeUrl(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

function resolveCanonicalUrl(entityKey, entityLabel) {
  if (looksLikeUrl(entityKey)) {
    return entityKey;
  }

  if (looksLikeUrl(entityLabel)) {
    return entityLabel;
  }

  if (typeof entityKey === "string" && entityKey.startsWith("/")) {
    return `${runtimeDefaults.site.canonicalOrigin}${entityKey}`;
  }

  return entityKey ?? null;
}

function buildGrowthWhereClause() {
  const thresholds = opportunityThresholds.growth;

  return `
entity_type = "page"
AND current_impressions >= ${thresholds.currentImpressionsMin}
AND current_position IS NOT NULL
AND current_position <= ${thresholds.currentPositionMax}
AND (
  (
    previous_clicks >= ${thresholds.previousClicksMin}
    AND clicks_delta >= ${thresholds.clicksDeltaMin}
    AND SAFE_DIVIDE(clicks_delta, NULLIF(previous_clicks, 0)) >= ${thresholds.clicksGainRateMin}
  )
  OR
  (
    previous_sessions >= ${thresholds.previousSessionsMin}
    AND sessions_delta >= ${thresholds.sessionsDeltaMin}
    AND SAFE_DIVIDE(sessions_delta, NULLIF(previous_sessions, 0)) >= ${thresholds.sessionsGainRateMin}
  )
)
AND (
  (
    previous_position IS NOT NULL
    AND position_delta <= ${thresholds.positionDeltaMax}
  )
  OR impressions_delta >= ${thresholds.impressionsDeltaMin}
)
`.trim();
}

function buildRankDropWhereClause() {
  const thresholds = opportunityThresholds.rankDrop;

  return `
entity_type = "page"
AND previous_impressions >= ${thresholds.previousImpressionsMin}
AND previous_position IS NOT NULL
AND previous_position <= ${thresholds.previousPositionMax}
AND (
  (
    previous_clicks >= ${thresholds.previousClicksMin}
    AND clicks_delta <= -${thresholds.clicksDeltaMin}
    AND SAFE_DIVIDE(ABS(clicks_delta), NULLIF(previous_clicks, 0)) >= ${thresholds.clicksLossRateMin}
  )
  OR
  (
    previous_sessions >= ${thresholds.previousSessionsMin}
    AND sessions_delta <= -${thresholds.sessionsDeltaMin}
    AND SAFE_DIVIDE(ABS(sessions_delta), NULLIF(previous_sessions, 0)) >= ${thresholds.sessionsLossRateMin}
  )
)
AND position_delta >= ${thresholds.positionDeltaMin}
`.trim();
}

function buildRewriteWhereClause() {
  const thresholds = opportunityThresholds.rewrite;

  return `
entity_type = "page"
AND current_impressions >= ${thresholds.currentImpressionsMin}
AND current_position IS NOT NULL
AND current_position >= ${thresholds.currentPositionMin}
AND current_position <= ${thresholds.currentPositionMax}
AND current_ctr IS NOT NULL
AND current_ctr <= ${thresholds.currentCtrMax}
`.trim();
}

function buildCannibalWhereClause() {
  const thresholds = opportunityThresholds.cannibal;

  return `
entity_type = "query"
AND current_support_count >= ${thresholds.currentSupportCountMin}
AND current_impressions >= ${thresholds.currentImpressionsMin}
AND current_position IS NOT NULL
AND current_position <= ${thresholds.currentPositionMax}
`.trim();
}

function buildOverviewQuery({ projectId, martDatasetId }) {
  return `
WITH anchor AS (
  SELECT
    MIN(data_date) AS earliest_date,
    MAX(data_date) AS latest_date,
    COUNT(DISTINCT data_date) AS active_days
  FROM \`${projectId}.${martDatasetId}.page_daily\`
),
candidate_summary AS (
  SELECT
    COUNTIF(entity_type = "page" AND previous_clicks IS NOT NULL) AS candidate_page_previous_rows
  FROM \`${projectId}.${martDatasetId}.improvement_candidates_base\`
  WHERE reference_end_date IS NOT NULL
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
  FROM \`${projectId}.${martDatasetId}.page_daily\` AS p
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
  COUNT(DISTINCT IF(period_name = "previous_7d" AND has_gsc_row AND has_ga4_row, page_path, NULL)) AS previous_matched_pages,
  MAX(candidate_summary.candidate_page_previous_rows) AS candidate_page_previous_rows
FROM periodized
CROSS JOIN candidate_summary
WHERE period_name IS NOT NULL
GROUP BY reference_end_date, earliest_date, latest_date, active_days
`;
}

function buildCandidateQuery({ projectId, martDatasetId, whereClause, orderByClause }) {
  return `
SELECT
  reference_end_date,
  entity_type,
  entity_key,
  entity_label,
  supporting_key,
  current_clicks,
  previous_clicks,
  clicks_delta,
  current_impressions,
  previous_impressions,
  impressions_delta,
  current_ctr,
  previous_ctr,
  ctr_delta,
  current_position,
  previous_position,
  position_delta,
  current_sessions,
  previous_sessions,
  sessions_delta,
  current_total_users,
  previous_total_users,
  total_users_delta,
  current_key_events,
  previous_key_events,
  key_events_delta,
  current_support_count,
  previous_support_count
FROM \`${projectId}.${martDatasetId}.improvement_candidates_base\`
WHERE reference_end_date IS NOT NULL
  AND ${whereClause}
ORDER BY ${orderByClause}
LIMIT ${digestLimit}
`;
}

function buildQueryMovesQuery({ projectId, martDatasetId }) {
  return `
WITH anchor AS (
  SELECT MAX(data_date) AS reference_end_date
  FROM \`${projectId}.${martDatasetId}.query_daily\`
),
periodized AS (
  SELECT
    a.reference_end_date,
    q.data_date,
    q.query,
    q.clicks,
    q.impressions,
    q.ctr,
    q.position,
    q.page_count,
    q.top_page_path,
    q.top_page_canonical_url,
    CASE
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 6 DAY) AND a.reference_end_date THEN "current_7d"
      WHEN q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND DATE_SUB(a.reference_end_date, INTERVAL 7 DAY) THEN "previous_7d"
      ELSE NULL
    END AS period_name
  FROM \`${projectId}.${martDatasetId}.query_daily\` AS q
  CROSS JOIN anchor AS a
  WHERE q.data_date BETWEEN DATE_SUB(a.reference_end_date, INTERVAL 13 DAY) AND a.reference_end_date
),
current_top_page AS (
  SELECT
    reference_end_date,
    query,
    top_page_path,
    top_page_canonical_url,
    ROW_NUMBER() OVER (
      PARTITION BY reference_end_date, query
      ORDER BY clicks DESC, impressions DESC, data_date DESC
    ) AS query_rank
  FROM periodized
  WHERE period_name = "current_7d"
),
aggregated AS (
  SELECT
    reference_end_date,
    query,
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
    MAX(IF(period_name = "current_7d", COALESCE(page_count, 0), 0)) AS max_page_count
  FROM periodized
  WHERE period_name IS NOT NULL
  GROUP BY reference_end_date, query
)
SELECT
  a.reference_end_date,
  a.query,
  a.current_clicks,
  a.previous_clicks,
  a.current_clicks - a.previous_clicks AS clicks_delta,
  a.current_impressions,
  a.previous_impressions,
  a.current_ctr,
  a.previous_ctr,
  a.current_position,
  a.previous_position,
  a.max_page_count,
  c.top_page_path,
  c.top_page_canonical_url
FROM aggregated AS a
LEFT JOIN current_top_page AS c
  ON a.reference_end_date = c.reference_end_date
 AND a.query = c.query
 AND c.query_rank = 1
WHERE a.current_impressions > 0 OR a.previous_impressions > 0
ORDER BY ABS(a.current_clicks - a.previous_clicks) DESC, a.current_impressions DESC, a.query ASC
LIMIT ${digestLimit}
`;
}

function buildWindow(overview) {
  if (!overview) {
    return {
      reference_end_date: null,
      current_start_date: null,
      current_end_date: null,
      previous_start_date: null,
      previous_end_date: null,
      latest_date: null,
      active_days: 0,
      target_days: comparisonWindowDays,
      remaining_days: comparisonWindowDays,
      eta_date: null,
      comparison_ready: false,
      status: "no_data",
      status_reason: "BigQuery mart に digest 用データがまだありません。",
    };
  }

  const activeDays = Math.max(0, Math.floor(clampNumber(overview.active_days, 0)));
  const latestDate = overview.latest_date ?? overview.reference_end_date ?? null;
  const readyByWindow = activeDays >= comparisonWindowDays;
  const readyByPrevious = clampNumber(overview.candidate_page_previous_rows, 0) > 0;
  const remainingDays = readyByWindow ? 0 : comparisonWindowDays - activeDays;
  const etaDate = latestDate ? addDaysToDateString(latestDate, remainingDays) : null;
  let status = "collecting";
  let statusReason = "前週比較に必要なデータを蓄積中です。";

  if (readyByPrevious) {
    status = "ready";
    statusReason = "最新 7 日と前 7 日を比較できます。";
  } else if (readyByWindow) {
    status = "window_ready_but_previous_missing";
    statusReason = "14 日分の履歴はありますが、比較に必要な前週データがまだ不足しています。";
  }

  return {
    reference_end_date: overview.reference_end_date ?? null,
    current_start_date: addDaysToDateString(overview.reference_end_date ?? null, -6),
    current_end_date: overview.reference_end_date ?? null,
    previous_start_date: addDaysToDateString(overview.reference_end_date ?? null, -13),
    previous_end_date: addDaysToDateString(overview.reference_end_date ?? null, -7),
    latest_date: latestDate,
    active_days: activeDays,
    target_days: comparisonWindowDays,
    remaining_days: remainingDays,
    eta_date: etaDate,
    comparison_ready: status === "ready",
    status,
    status_reason: statusReason,
  };
}

function buildKpis(overview) {
  return {
    clicks: metricSummary(overview?.current_clicks, overview?.previous_clicks),
    impressions: metricSummary(overview?.current_impressions, overview?.previous_impressions),
    sessions: metricSummary(overview?.current_sessions, overview?.previous_sessions),
    total_users: metricSummary(overview?.current_total_users, overview?.previous_total_users),
    key_events: metricSummary(overview?.current_key_events, overview?.previous_key_events),
    matched_pages: metricSummary(overview?.current_matched_pages, overview?.previous_matched_pages),
  };
}

function buildPageItem(row, kind) {
  const canonicalUrl = resolveCanonicalUrl(row.entity_key, row.entity_label);

  return {
    kind,
    entity_key: row.entity_key ?? null,
    entity_label: normalizePageLabel(row.entity_label) ?? normalizePageLabel(row.entity_key) ?? null,
    canonical_url: canonicalUrl,
    current_clicks: clampNumber(row.current_clicks, 0),
    previous_clicks: clampNumber(row.previous_clicks, 0),
    clicks_delta: clampNumber(row.clicks_delta, 0),
    current_impressions: clampNumber(row.current_impressions, 0),
    previous_impressions: clampNumber(row.previous_impressions, 0),
    current_ctr: roundRate(row.current_ctr),
    previous_ctr: roundRate(row.previous_ctr),
    current_position: normalizeNullableNumber(row.current_position),
    previous_position: normalizeNullableNumber(row.previous_position),
    position_delta: normalizeNullableNumber(row.position_delta),
    current_sessions: clampNumber(row.current_sessions, 0),
    previous_sessions: clampNumber(row.previous_sessions, 0),
    sessions_delta: clampNumber(row.sessions_delta, 0),
  };
}

function buildQueryMoveItem(row) {
  return {
    query: row.query ?? null,
    top_page_path: row.top_page_path ?? null,
    top_page_canonical_url: row.top_page_canonical_url ?? null,
    current_clicks: clampNumber(row.current_clicks, 0),
    previous_clicks: clampNumber(row.previous_clicks, 0),
    clicks_delta: clampNumber(row.clicks_delta, 0),
    current_impressions: clampNumber(row.current_impressions, 0),
    previous_impressions: clampNumber(row.previous_impressions, 0),
    current_ctr: roundRate(row.current_ctr),
    previous_ctr: roundRate(row.previous_ctr),
    current_position: normalizeNullableNumber(row.current_position),
    previous_position: normalizeNullableNumber(row.previous_position),
    max_page_count: clampNumber(row.max_page_count, 0),
  };
}

function buildOpportunityItem(row, kind) {
  const title =
    kind === "rewrite"
      ? "CTR が低いページをリライト候補として確認"
      : "複数ページに分散する query を整理";
  const reason =
    kind === "rewrite"
      ? `表示 ${clampNumber(row.current_impressions, 0)} / CTR ${formatPercent(
          clampNumber(row.current_ctr, 0),
        )} / 順位 ${normalizeNullableNumber(row.current_position) ?? "-"}`
      : `表示 ${clampNumber(row.current_impressions, 0)} / support ${clampNumber(
          row.current_support_count,
          0,
        )} / 順位 ${normalizeNullableNumber(row.current_position) ?? "-"}`;

  return {
    kind,
    title,
    entity_key: row.entity_key ?? null,
    entity_label: normalizePageLabel(row.entity_label) ?? normalizePageLabel(row.entity_key) ?? null,
    supporting_key: row.supporting_key ?? null,
    reason,
    current_impressions: clampNumber(row.current_impressions, 0),
    current_ctr: roundRate(row.current_ctr),
    current_position: normalizeNullableNumber(row.current_position),
    current_support_count: clampNumber(row.current_support_count, 0),
  };
}

function buildNextActionCandidates({ winners, losers, opportunities, queryMoves, window }) {
  if (!window.comparison_ready) {
    return [];
  }

  const firstLoser = losers[0];
  if (firstLoser) {
    return [
      {
        kind: "defence",
        title: `${firstLoser.entity_label} の失速を先に確認`,
        reason: `クリック ${formatSignedNumber(firstLoser.clicks_delta)} / sessions ${formatSignedNumber(firstLoser.sessions_delta)} / 順位 ${formatSignedNumber(firstLoser.position_delta, 1)}`,
        entity_key: firstLoser.entity_key,
      },
    ];
  }

  const firstRewrite = opportunities.find((item) => item.kind === "rewrite");
  if (firstRewrite) {
    return [
      {
        kind: "rewrite",
        title: `${firstRewrite.entity_label} をリライト候補として着手`,
        reason: firstRewrite.reason,
        entity_key: firstRewrite.entity_key,
      },
    ];
  }

  const firstCannibal = opportunities.find((item) => item.kind === "cannibal");
  if (firstCannibal) {
    return [
      {
        kind: "cannibal",
        title: `${firstCannibal.entity_label} のカニバリを整理`,
        reason: firstCannibal.reason,
        entity_key: firstCannibal.entity_key,
      },
    ];
  }

  const firstWinner = winners[0];
  if (firstWinner) {
    return [
      {
        kind: "follow_growth",
        title: `${firstWinner.entity_label} を横展開候補として観察`,
        reason: `クリック ${formatSignedNumber(firstWinner.clicks_delta)} / sessions ${formatSignedNumber(firstWinner.sessions_delta)}`,
        entity_key: firstWinner.entity_key,
      },
    ];
  }

  const firstQueryMove = queryMoves[0];
  if (firstQueryMove) {
    return [
      {
        kind: "query_check",
        title: `${firstQueryMove.query} の流入変化を確認`,
        reason: `クリック ${formatSignedNumber(firstQueryMove.clicks_delta)} / 表示 ${formatSignedNumber(firstQueryMove.current_impressions - firstQueryMove.previous_impressions)}`,
        entity_key: firstQueryMove.query,
      },
    ];
  }

  return [];
}

export function buildAnalystDigest(snapshot) {
  const overview = snapshot?.overview ?? null;
  const window = buildWindow(overview);
  const kpis = buildKpis(overview);

  const winners = window.comparison_ready
    ? (snapshot?.winners ?? []).map((row) => buildPageItem(row, "growth"))
    : [];
  const losers = window.comparison_ready
    ? (snapshot?.losers ?? []).map((row) => buildPageItem(row, "rank-drop"))
    : [];
  const queryMoves = window.comparison_ready
    ? (snapshot?.queryMoves ?? []).map(buildQueryMoveItem)
    : [];
  const opportunities = window.comparison_ready
    ? [
        ...(snapshot?.rewriteOpportunities ?? []).map((row) => buildOpportunityItem(row, "rewrite")),
        ...(snapshot?.cannibalOpportunities ?? []).map((row) =>
          buildOpportunityItem(row, "cannibal"),
        ),
      ]
    : [];
  const nextActionCandidates = buildNextActionCandidates({
    winners,
    losers,
    opportunities,
    queryMoves,
    window,
  });

  return {
    window,
    kpis,
    winners,
    losers,
    query_moves: queryMoves,
    opportunities,
    next_action_candidates: nextActionCandidates,
    revenue: null,
    social_x: null,
  };
}

function renderPageList(items, fallbackMessage) {
  if (items.length === 0) {
    return [`- ${fallbackMessage}`];
  }

  return items.map((item) => {
    return `- ${item.entity_label} | クリック ${formatSignedNumber(item.clicks_delta)} / sessions ${formatSignedNumber(
      item.sessions_delta,
    )} / 表示 ${item.current_impressions}`;
  });
}

function renderQueryAndOpportunityList(queryMoves, opportunities, window) {
  if (!window.comparison_ready) {
    return [`- 比較データ蓄積中 (${window.active_days}/${window.target_days}日)`];
  }

  const lines = [];

  if (queryMoves.length > 0) {
    queryMoves.slice(0, 3).forEach((item) => {
      lines.push(
        `- Query: ${item.query} | クリック ${formatSignedNumber(item.clicks_delta)} / 表示 ${formatSignedNumber(
          item.current_impressions - item.previous_impressions,
        )} / top ${item.top_page_path ?? "-"}`,
      );
    });
  }

  if (opportunities.length > 0) {
    opportunities.slice(0, 2).forEach((item) => {
      lines.push(`- Opportunity(${item.kind}): ${item.entity_label} | ${item.reason}`);
    });
  }

  return lines.length > 0 ? lines : ["- 大きな変化はまだありません。"];
}

export function renderAnalystHumanDigest(digest) {
  const { window, kpis, winners, losers, query_moves: queryMoves, opportunities, next_action_candidates: nextActions } =
    digest;

  const lines = [
    "今日の要点",
    `- 状態: ${
      window.status === "ready"
        ? "比較可能"
        : window.status === "window_ready_but_previous_missing"
          ? "比較準備中"
          : "蓄積中"
    }`,
    `- 期間: ${window.current_start_date ?? "-"}〜${window.current_end_date ?? "-"} vs ${window.previous_start_date ?? "-"}〜${window.previous_end_date ?? "-"}`,
    `- ${formatMetricLine("クリック", kpis.clicks)} / ${formatMetricLine("Sessions", kpis.sessions)}`,
    `- ${formatMetricLine("表示", kpis.impressions)} / ${formatMetricLine("Users", kpis.total_users)}`,
    `- 収益: 未接続 / X寄与: 未接続`,
  ];

  if (!window.comparison_ready) {
    lines.push(`- メモ: ${window.status_reason}${window.eta_date ? ` 最短 ${window.eta_date}` : ""}`);
  }

  lines.push("", "伸びたページ", ...renderPageList(winners, "比較可能になり次第、ここに表示します。"));
  lines.push("", "落ちたページ", ...renderPageList(losers, "比較可能になり次第、ここに表示します。"));
  lines.push("", "流入クエリ/改善候補", ...renderQueryAndOpportunityList(queryMoves, opportunities, window));
  lines.push("", "次の一手");

  if (nextActions.length === 0) {
    lines.push(
      `- ${
        window.comparison_ready ? "大きな修正候補はまだありません。" : `蓄積中 (${window.active_days}/${window.target_days}日)`
      }`,
    );
  } else {
    lines.push(`- ${nextActions[0].title} | ${nextActions[0].reason}`);
  }

  return lines.join("\n");
}

export async function loadFixtureSnapshot(fixturePath) {
  const absolutePath = path.resolve(fixturePath);
  const payload = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(payload);
}

export async function fetchAnalystSnapshot({ config, token }) {
  const queries = [
    buildOverviewQuery(config),
    buildCandidateQuery({
      projectId: config.projectId,
      martDatasetId: config.martDatasetId,
      whereClause: buildGrowthWhereClause(),
      orderByClause:
        "clicks_delta DESC, sessions_delta DESC, current_impressions DESC, entity_key ASC",
    }),
    buildCandidateQuery({
      projectId: config.projectId,
      martDatasetId: config.martDatasetId,
      whereClause: buildRankDropWhereClause(),
      orderByClause:
        "position_delta DESC, clicks_delta ASC, sessions_delta ASC, current_impressions DESC, entity_key ASC",
    }),
    buildQueryMovesQuery(config),
    buildCandidateQuery({
      projectId: config.projectId,
      martDatasetId: config.martDatasetId,
      whereClause: buildRewriteWhereClause(),
      orderByClause: "current_impressions DESC, current_ctr ASC, current_position ASC, entity_key ASC",
    }),
    buildCandidateQuery({
      projectId: config.projectId,
      martDatasetId: config.martDatasetId,
      whereClause: buildCannibalWhereClause(),
      orderByClause:
        "current_support_count DESC, current_impressions DESC, current_position ASC, entity_key ASC",
    }),
  ];

  const [overviewRows, winners, losers, queryMoves, rewriteOpportunities, cannibalOpportunities] =
    await Promise.all(
      queries.map((query) =>
        runQuery({
          projectId: config.projectId,
          query,
          token,
          location: config.location,
        }),
      ),
    );

  return {
    overview: overviewRows[0] ?? null,
    winners,
    losers,
    queryMoves,
    rewriteOpportunities,
    cannibalOpportunities,
  };
}

export async function getBigQueryToken(getAccessTokenFn) {
  return getAccessTokenFn(BIGQUERY_SCOPE);
}
