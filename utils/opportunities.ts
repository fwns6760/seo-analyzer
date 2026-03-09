import "server-only";

import { runBigQueryQuery } from "@/utils/bigquery";
import {
  cannibalHeuristic,
  cannibalOrderByClause,
  cannibalWhereClause,
} from "@/utils/opportunity-cannibal";
import {
  growthHeuristic,
  growthOrderByClause,
  growthWhereClause,
} from "@/utils/opportunity-growth";
import {
  rankDropHeuristic,
  rankDropOrderByClause,
  rankDropWhereClause,
} from "@/utils/opportunity-rank-drop";
import {
  rewriteHeuristic,
  rewriteOrderByClause,
  rewriteWhereClause,
} from "@/utils/opportunity-rewrite";

export const opportunityKindOrder = ["growth", "rank-drop", "rewrite", "cannibal"] as const;

export type OpportunityKind = (typeof opportunityKindOrder)[number];

type OpportunityEntityType = "page" | "query";

type OpportunityKindMeta = {
  title: string;
  shortLabel: string;
  description: string;
  emptyMessage: string;
  entityType: OpportunityEntityType;
  drilldownLabel: string;
  heuristic: string;
};

export const opportunityKindMeta: Record<OpportunityKind, OpportunityKindMeta> = {
  growth: {
    title: "伸びた記事",
    shortLabel: "Growth feed",
    description: "今週伸びたページを一覧で確認し、次に伸ばす先を決めます。",
    emptyMessage: "今週は明確に伸びたページがまだ出ていません。",
    entityType: "page",
    drilldownLabel: "記事分析へ",
    heuristic: growthHeuristic,
  },
  "rank-drop": {
    title: "順位下落",
    shortLabel: "Defence feed",
    description: "まず守るべきページを先に拾い、失速の深掘りへつなげます。",
    emptyMessage: "現時点で大きな下落シグナルは見つかっていません。",
    entityType: "page",
    drilldownLabel: "記事分析へ",
    heuristic: rankDropHeuristic,
  },
  rewrite: {
    title: "リライト候補",
    shortLabel: "Rewrite feed",
    description: "表示はあるのに取り切れていないページをまとめて見ます。",
    emptyMessage: "今週は暫定条件に一致するリライト候補がありません。",
    entityType: "page",
    drilldownLabel: "記事分析へ",
    heuristic: rewriteHeuristic,
  },
  cannibal: {
    title: "カニバリ候補",
    shortLabel: "Cannibal feed",
    description: "複数ページに分散している query を見つけて、意図整理へつなげます。",
    emptyMessage: "今週は複数ページに強く分散した query がまだ出ていません。",
    entityType: "query",
    drilldownLabel: "クエリ分析へ",
    heuristic: cannibalHeuristic,
  },
};

export type OpportunityItem = {
  reference_end_date: string;
  entity_type: OpportunityEntityType;
  entity_key: string;
  entity_label: string;
  supporting_key: string | null;
  current_clicks: number | null;
  previous_clicks: number | null;
  clicks_delta: number;
  current_impressions: number | null;
  previous_impressions: number | null;
  impressions_delta: number;
  current_ctr: number | null;
  previous_ctr: number | null;
  ctr_delta: number | null;
  current_position: number | null;
  previous_position: number | null;
  position_delta: number | null;
  current_sessions: number | null;
  previous_sessions: number | null;
  sessions_delta: number | null;
  current_total_users: number | null;
  previous_total_users: number | null;
  total_users_delta: number | null;
  current_key_events: number | null;
  previous_key_events: number | null;
  key_events_delta: number | null;
  current_support_count: number | null;
  previous_support_count: number | null;
};

type OpportunitySummaryRow = {
  reference_end_date: string | null;
  growth_count: number;
  rank_drop_count: number;
  rewrite_count: number;
  cannibal_count: number;
  page_previous_rows: number;
  page_latest_date: string | null;
  page_active_days: number;
};

type OpportunitySummaryCountKey =
  | "growth_count"
  | "rank_drop_count"
  | "rewrite_count"
  | "cannibal_count";

export type OpportunityGroup = OpportunityKindMeta & {
  kind: OpportunityKind;
  totalItems: number;
  items: OpportunityItem[];
};

export type OpportunityFeedData = {
  referenceEndDate: string | null;
  comparisonReady: boolean;
  pageLatestDate: string | null;
  pageActiveDays: number;
  selectedKind: OpportunityKind;
  selectedItem: OpportunityItem | null;
  groups: OpportunityGroup[];
  requestedSelectionMissing: boolean;
};

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCP_PROJECT_ID ??
  process.env.BIGQUERY_PROJECT_ID ??
  "baseballsite";

const martDataset = process.env.BIGQUERY_MART_DATASET ?? "seo_mart";
const candidateListLimit = 24;

function martTable(tableName: string) {
  return `\`${projectId}.${martDataset}.${tableName}\``;
}

const opportunityQueryDefinitions: Record<
  OpportunityKind,
  {
    where: string;
    orderBy: string;
    countKey: OpportunitySummaryCountKey;
  }
> = {
  growth: {
    where: growthWhereClause,
    orderBy: growthOrderByClause,
    countKey: "growth_count",
  },
  "rank-drop": {
    where: rankDropWhereClause,
    orderBy: rankDropOrderByClause,
    countKey: "rank_drop_count",
  },
  rewrite: {
    where: rewriteWhereClause,
    orderBy: rewriteOrderByClause,
    countKey: "rewrite_count",
  },
  cannibal: {
    where: cannibalWhereClause,
    orderBy: cannibalOrderByClause,
    countKey: "cannibal_count",
  },
};

const opportunityColumns = `
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
`;

const summaryQuery = `
WITH page_anchor AS (
  SELECT
    MAX(data_date) AS page_latest_date,
    COUNT(DISTINCT data_date) AS page_active_days
  FROM ${martTable("page_daily")}
),
candidate_summary AS (
  SELECT
    MAX(reference_end_date) AS reference_end_date,
    COUNTIF(${opportunityQueryDefinitions.growth.where}) AS growth_count,
    COUNTIF(${opportunityQueryDefinitions["rank-drop"].where}) AS rank_drop_count,
    COUNTIF(${opportunityQueryDefinitions.rewrite.where}) AS rewrite_count,
    COUNTIF(${opportunityQueryDefinitions.cannibal.where}) AS cannibal_count,
    COUNTIF(entity_type = "page" AND previous_clicks IS NOT NULL) AS page_previous_rows
  FROM ${martTable("improvement_candidates_base")}
  WHERE reference_end_date IS NOT NULL
)
SELECT
  c.reference_end_date,
  c.growth_count,
  c.rank_drop_count,
  c.rewrite_count,
  c.cannibal_count,
  c.page_previous_rows,
  p.page_latest_date,
  p.page_active_days
FROM candidate_summary AS c
CROSS JOIN page_anchor AS p
`;

function buildOpportunityListQuery(kind: OpportunityKind) {
  const definition = opportunityQueryDefinitions[kind];

  return `
SELECT
  ${opportunityColumns}
FROM ${martTable("improvement_candidates_base")}
WHERE reference_end_date IS NOT NULL
  AND ${definition.where}
ORDER BY ${definition.orderBy}
LIMIT ${candidateListLimit}
`;
}

export function isOpportunityKind(value: string | null | undefined): value is OpportunityKind {
  return typeof value === "string" && opportunityKindOrder.includes(value as OpportunityKind);
}

export async function getOpportunityFeedData(
  selectedKindInput: string | null,
  selectedEntityKey: string | null,
): Promise<OpportunityFeedData> {
  const [summaryRows, growthItems, rankDropItems, rewriteItems, cannibalItems] = await Promise.all([
    runBigQueryQuery<OpportunitySummaryRow>(summaryQuery),
    runBigQueryQuery<OpportunityItem>(buildOpportunityListQuery("growth")),
    runBigQueryQuery<OpportunityItem>(buildOpportunityListQuery("rank-drop")),
    runBigQueryQuery<OpportunityItem>(buildOpportunityListQuery("rewrite")),
    runBigQueryQuery<OpportunityItem>(buildOpportunityListQuery("cannibal")),
  ]);

  const summary = summaryRows[0] ?? null;
  const itemsByKind: Record<OpportunityKind, OpportunityItem[]> = {
    growth: growthItems,
    "rank-drop": rankDropItems,
    rewrite: rewriteItems,
    cannibal: cannibalItems,
  };

  const groups = opportunityKindOrder.map((kind) => {
    const definition = opportunityQueryDefinitions[kind];

    return {
      kind,
      ...opportunityKindMeta[kind],
      totalItems: summary?.[definition.countKey] ?? itemsByKind[kind].length,
      items: itemsByKind[kind],
    };
  });

  const fallbackKind = groups.find((group) => group.items.length > 0)?.kind ?? opportunityKindOrder[0];
  const selectedKind = isOpportunityKind(selectedKindInput) ? selectedKindInput : fallbackKind;
  const selectedGroup = groups.find((group) => group.kind === selectedKind) ?? groups[0];
  const matchedItem =
    selectedEntityKey !== null
      ? selectedGroup.items.find((item) => item.entity_key === selectedEntityKey) ?? null
      : null;
  const requestedSelectionMissing = selectedEntityKey !== null && matchedItem === null;
  const selectedItem = requestedSelectionMissing ? null : matchedItem ?? selectedGroup.items[0] ?? null;
  const firstAvailableItem = groups.flatMap((group) => group.items).find(Boolean) ?? null;

  return {
    referenceEndDate: summary?.reference_end_date ?? firstAvailableItem?.reference_end_date ?? null,
    comparisonReady: (summary?.page_previous_rows ?? 0) > 0,
    pageLatestDate: summary?.page_latest_date ?? summary?.reference_end_date ?? null,
    pageActiveDays: summary?.page_active_days ?? 0,
    selectedKind,
    selectedItem,
    groups,
    requestedSelectionMissing,
  };
}
