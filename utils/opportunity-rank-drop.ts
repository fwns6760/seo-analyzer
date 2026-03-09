const rankDropThresholds = {
  previousImpressionsMin: 50,
  previousPositionMax: 20,
  positionDeltaMin: 1,
  previousClicksMin: 5,
  clicksDeltaMin: 3,
  clicksLossRateMin: 0.2,
  previousSessionsMin: 5,
  sessionsDeltaMin: 3,
  sessionsLossRateMin: 0.2,
} as const;

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export const rankDropWhereClause = `
entity_type = "page"
AND current_clicks IS NOT NULL
AND previous_clicks IS NOT NULL
AND previous_impressions >= ${rankDropThresholds.previousImpressionsMin}
AND current_position IS NOT NULL
AND previous_position IS NOT NULL
AND previous_position <= ${rankDropThresholds.previousPositionMax}
AND position_delta >= ${rankDropThresholds.positionDeltaMin}
AND (
  (
    previous_clicks >= ${rankDropThresholds.previousClicksMin}
    AND clicks_delta <= -${rankDropThresholds.clicksDeltaMin}
    AND SAFE_DIVIDE(-clicks_delta, NULLIF(previous_clicks, 0)) >= ${rankDropThresholds.clicksLossRateMin}
  )
  OR
  (
    previous_sessions >= ${rankDropThresholds.previousSessionsMin}
    AND sessions_delta <= -${rankDropThresholds.sessionsDeltaMin}
    AND SAFE_DIVIDE(-sessions_delta, NULLIF(previous_sessions, 0)) >= ${rankDropThresholds.sessionsLossRateMin}
  )
)
`.trim();

export const rankDropOrderByClause = `
position_delta DESC,
SAFE_DIVIDE(-clicks_delta, NULLIF(previous_clicks, 0)) DESC,
SAFE_DIVIDE(-sessions_delta, NULLIF(previous_sessions, 0)) DESC,
previous_clicks DESC,
entity_key ASC
`.trim();

export const rankDropHeuristic = `前週で表示 ${rankDropThresholds.previousImpressionsMin} 以上かつ ${rankDropThresholds.previousPositionMax} 位以内にいた page のうち、平均順位が ${rankDropThresholds.positionDeltaMin.toFixed(1)} 以上悪化し、クリックまたは sessions が ${formatPercent(rankDropThresholds.clicksLossRateMin)} 以上かつ ${rankDropThresholds.clicksDeltaMin} 以上落ちたものを対象にしています。`;

export const rankDropRuleBullets = [
  `前週の表示回数が ${rankDropThresholds.previousImpressionsMin} 以上で、前週平均順位が ${rankDropThresholds.previousPositionMax} 位以内だった page に絞ります。`,
  `平均順位の悪化が ${rankDropThresholds.positionDeltaMin.toFixed(1)} 以上あることを必須にし、需要減だけのページを外します。`,
  `クリックは前週 ${rankDropThresholds.previousClicksMin} 以上を母数に、${rankDropThresholds.clicksDeltaMin} 以上かつ ${formatPercent(rankDropThresholds.clicksLossRateMin)} 以上の下落でシグナル化します。`,
  `Organic Sessions も前週 ${rankDropThresholds.previousSessionsMin} 以上を母数に、${rankDropThresholds.sessionsDeltaMin} 以上かつ ${formatPercent(rankDropThresholds.sessionsLossRateMin)} 以上の下落なら候補に含めます。`,
  "一覧の並び順は平均順位の悪化幅を最優先にし、その後にクリック損失率、sessions 損失率を見ます。",
] as const;
