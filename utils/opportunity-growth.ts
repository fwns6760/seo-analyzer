const growthThresholds = {
  currentImpressionsMin: 50,
  currentPositionMax: 20,
  previousClicksMin: 5,
  clicksDeltaMin: 3,
  clicksGainRateMin: 0.2,
  previousSessionsMin: 5,
  sessionsDeltaMin: 3,
  sessionsGainRateMin: 0.2,
  positionDeltaMax: -0.5,
  impressionsDeltaMin: 30,
} as const;

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export const growthWhereClause = `
entity_type = "page"
AND current_impressions >= ${growthThresholds.currentImpressionsMin}
AND current_position IS NOT NULL
AND current_position <= ${growthThresholds.currentPositionMax}
AND (
  (
    previous_clicks >= ${growthThresholds.previousClicksMin}
    AND clicks_delta >= ${growthThresholds.clicksDeltaMin}
    AND SAFE_DIVIDE(clicks_delta, NULLIF(previous_clicks, 0)) >= ${growthThresholds.clicksGainRateMin}
  )
  OR
  (
    previous_sessions >= ${growthThresholds.previousSessionsMin}
    AND sessions_delta >= ${growthThresholds.sessionsDeltaMin}
    AND SAFE_DIVIDE(sessions_delta, NULLIF(previous_sessions, 0)) >= ${growthThresholds.sessionsGainRateMin}
  )
)
AND (
  (
    previous_position IS NOT NULL
    AND position_delta <= ${growthThresholds.positionDeltaMax}
  )
  OR impressions_delta >= ${growthThresholds.impressionsDeltaMin}
)
`.trim();

export const growthOrderByClause = `
SAFE_DIVIDE(clicks_delta, NULLIF(previous_clicks, 0)) DESC,
SAFE_DIVIDE(sessions_delta, NULLIF(previous_sessions, 0)) DESC,
clicks_delta DESC,
current_position ASC,
current_impressions DESC,
entity_key ASC
`.trim();

export const growthHeuristic = `今週の表示が ${growthThresholds.currentImpressionsMin} 以上あり、現在 ${growthThresholds.currentPositionMax} 位以内にいる page のうち、クリックまたは sessions が ${formatPercent(growthThresholds.clicksGainRateMin)} 以上かつ ${growthThresholds.clicksDeltaMin} 以上伸び、さらに順位改善または表示増が確認できるものを対象にしています。`;

export const growthRuleBullets = [
  `今週の表示回数が ${growthThresholds.currentImpressionsMin} 以上で、現在平均順位が ${growthThresholds.currentPositionMax} 位以内の page に絞ります。`,
  `クリックは前週 ${growthThresholds.previousClicksMin} 以上を母数に、${growthThresholds.clicksDeltaMin} 以上かつ ${formatPercent(growthThresholds.clicksGainRateMin)} 以上の増加を条件にします。`,
  `Organic Sessions も前週 ${growthThresholds.previousSessionsMin} 以上を母数に、${growthThresholds.sessionsDeltaMin} 以上かつ ${formatPercent(growthThresholds.sessionsGainRateMin)} 以上の増加なら候補に含めます。`,
  `検索側の伸びを担保するため、平均順位が ${Math.abs(growthThresholds.positionDeltaMax).toFixed(1)} 以上改善しているか、表示回数が ${growthThresholds.impressionsDeltaMin} 以上増えていることも見ます。`,
  "一覧の並び順はクリック増加率、sessions 増加率、クリック増加幅、現在順位の順です。",
] as const;
