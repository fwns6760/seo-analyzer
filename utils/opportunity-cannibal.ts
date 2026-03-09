const cannibalThresholds = {
  currentSupportCountMin: 2,
  currentImpressionsMin: 80,
  currentPositionMax: 20,
} as const;

export const cannibalWhereClause = `
entity_type = "query"
AND current_support_count >= ${cannibalThresholds.currentSupportCountMin}
AND current_impressions >= ${cannibalThresholds.currentImpressionsMin}
AND current_position IS NOT NULL
AND current_position <= ${cannibalThresholds.currentPositionMax}
`.trim();

export const cannibalOrderByClause = `
current_support_count DESC,
current_impressions DESC,
current_clicks DESC,
current_position ASC,
entity_key ASC
`.trim();

export const cannibalHeuristic = `今週の表示が ${cannibalThresholds.currentImpressionsMin} 以上あり、平均順位が ${cannibalThresholds.currentPositionMax} 位以内なのに ${cannibalThresholds.currentSupportCountMin} ページ以上へ分散している query を、カニバリ候補として扱います。`;

export const cannibalRuleBullets = [
  `今週の出現ページ数が ${cannibalThresholds.currentSupportCountMin} 以上の query に絞ります。`,
  `今週の表示回数が ${cannibalThresholds.currentImpressionsMin} 以上ある、意味のある露出を持つ query だけを見ます。`,
  `平均順位が ${cannibalThresholds.currentPositionMax} 位以内の query に限定し、まだ戦えている query の意図分散を優先します。`,
  "一覧の並び順は出現ページ数、表示回数、クリック数、平均順位の順です。",
  "どのページに割れているかはクエリ分析画面で深掘りします。",
] as const;
