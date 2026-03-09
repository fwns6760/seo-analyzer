const rewriteThresholds = {
  currentImpressionsMin: 80,
  currentPositionMin: 6,
  currentPositionMax: 20,
  currentCtrMax: 0.12,
} as const;

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export const rewriteWhereClause = `
entity_type = "page"
AND current_impressions >= ${rewriteThresholds.currentImpressionsMin}
AND current_position BETWEEN ${rewriteThresholds.currentPositionMin} AND ${rewriteThresholds.currentPositionMax}
AND current_ctr IS NOT NULL
AND current_ctr < ${rewriteThresholds.currentCtrMax}
`.trim();

export const rewriteOrderByClause = `
current_impressions DESC,
current_position ASC,
current_ctr ASC,
current_clicks DESC,
entity_key ASC
`.trim();

export const rewriteHeuristic = `今週の表示が ${rewriteThresholds.currentImpressionsMin} 以上あり、平均順位が ${rewriteThresholds.currentPositionMin}-${rewriteThresholds.currentPositionMax} 位にいるのに CTR が ${formatPercent(rewriteThresholds.currentCtrMax)} 未満の page を、リライト優先候補として扱います。`;

export const rewriteRuleBullets = [
  `今週の表示回数が ${rewriteThresholds.currentImpressionsMin} 以上ある page に絞ります。`,
  `平均順位が ${rewriteThresholds.currentPositionMin}-${rewriteThresholds.currentPositionMax} 位の中位ページだけを対象にし、上位定着済みや圏外ページを外します。`,
  `CTR が ${formatPercent(rewriteThresholds.currentCtrMax)} 未満で、露出はあるのに取り切れていない page を候補化します。`,
  "一覧の並び順は表示回数を最優先にし、その後に順位、CTR、クリック数を見ます。",
  "タイトル、見出し、検索意図とのズレは記事分析画面で深掘りします。",
] as const;
