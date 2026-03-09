import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import {
  comparisonWindowDays,
  getComparisonWindowStatus,
} from "@/utils/comparison-window";
import { growthRuleBullets } from "@/utils/opportunity-growth";
import { rankDropRuleBullets } from "@/utils/opportunity-rank-drop";
import { rewriteRuleBullets } from "@/utils/opportunity-rewrite";
import { cannibalRuleBullets } from "@/utils/opportunity-cannibal";
import {
  getOpportunityFeedData,
  isOpportunityKind,
  opportunityKindMeta,
  opportunityKindOrder,
  type OpportunityItem,
  type OpportunityKind,
} from "@/utils/opportunities";

export const dynamic = "force-dynamic";

type OpportunitiesPageProps = {
  searchParams: Promise<{
    kind?: string;
    entity?: string;
  }>;
};

type MetricFormat = "number" | "percent" | "position";

type ComparisonCard = {
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  format: MetricFormat;
  improveDirection: "up" | "down";
  caption: string;
};

function formatMetricValue(value: number, format: MetricFormat) {
  if (format === "percent") {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (format === "position") {
    return value.toFixed(1);
  }

  return new Intl.NumberFormat("ja-JP").format(Math.round(value));
}

function formatOptionalMetricValue(value: number | null | undefined, format: MetricFormat) {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatMetricValue(value, format);
}

function formatNullableMetricDelta(
  currentValue: number | null | undefined,
  previousValue: number | null | undefined,
  format: MetricFormat,
) {
  if (
    (format === "percent" || format === "position") &&
    (currentValue === null ||
      currentValue === undefined ||
      previousValue === null ||
      previousValue === undefined)
  ) {
    return "比較データなし";
  }

  const current = currentValue ?? 0;
  const previous = previousValue ?? 0;
  const delta = current - previous;

  if (format === "percent") {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${(delta * 100).toFixed(1)} pt`;
  }

  if (format === "position") {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}`;
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ja-JP").format(Math.round(delta))}`;
}

function getDeltaTone(
  currentValue: number | null | undefined,
  previousValue: number | null | undefined,
  improveDirection: "up" | "down" = "up",
) {
  if (
    currentValue === null ||
    currentValue === undefined ||
    previousValue === null ||
    previousValue === undefined
  ) {
    return "neutral";
  }

  const delta = currentValue - previousValue;

  if (delta === 0) {
    return "neutral";
  }

  if (improveDirection === "down") {
    return delta < 0 ? "good" : "bad";
  }

  return delta > 0 ? "good" : "bad";
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function getComparisonPendingMessage(activeDays: number, etaDate: string | null) {
  const progress = `現在 ${activeDays}/${comparisonWindowDays} 日です。`;

  if (etaDate) {
    return `${progress}最短 ${formatDisplayDate(etaDate)} に前週比較がそろいます。`;
  }

  return `${progress}比較期間がそろうと候補を表示します。`;
}

function getComparisonStatusLabel(
  comparisonReady: boolean,
  activeDays: number,
  etaDate: string | null,
  readyByWindow: boolean,
) {
  if (comparisonReady) {
    return "current_7d vs previous_7d";
  }

  if (readyByWindow) {
    return "前週比較データ確認中";
  }

  if (etaDate) {
    return `蓄積中 ${activeDays}/${comparisonWindowDays}日 -> 最短 ${formatDisplayDate(etaDate)}`;
  }

  return `蓄積中 ${activeDays}/${comparisonWindowDays}日`;
}

function getPageLabel(path: string) {
  if (path === "/") {
    return "トップページ";
  }

  return path;
}

function getEntityTitle(item: OpportunityItem) {
  if (item.entity_type === "page") {
    return getPageLabel(item.entity_key);
  }

  return item.entity_key;
}

function getEntitySecondaryText(item: OpportunityItem) {
  if (item.entity_type === "page") {
    return item.entity_label;
  }

  const currentCount = formatOptionalMetricValue(item.current_support_count, "number");
  const previousCount = formatOptionalMetricValue(item.previous_support_count, "number");
  return `出現ページ ${currentCount} / 前週 ${previousCount}`;
}

function getOpportunityRoute(kind: OpportunityKind, entityKey?: string) {
  return entityKey
    ? {
        pathname: "/opportunities",
        query: {
          kind,
          entity: entityKey,
        },
      }
    : {
        pathname: "/opportunities",
        query: {
          kind,
        },
      };
}

function getDeepDiveRoute(item: OpportunityItem) {
  if (item.entity_type === "page") {
    return {
      pathname: "/articles",
      query: {
        page: item.entity_key,
      },
    };
  }

  return {
    pathname: "/queries",
    query: {
      query: item.entity_key,
    },
  };
}

function getDrilldownCaption(item: OpportunityItem) {
  if (item.entity_type === "page") {
    return "記事分析で日次推移と流入クエリを確認";
  }

  return "クエリ分析で紐づくページ分散を確認";
}

function getOpportunityStats(kind: OpportunityKind, item: OpportunityItem) {
  if (kind === "growth") {
    return `クリック ${formatNullableMetricDelta(item.current_clicks, item.previous_clicks, "number")} / Sessions ${formatNullableMetricDelta(item.current_sessions, item.previous_sessions, "number")}`;
  }

  if (kind === "rank-drop") {
    return `順位差 ${formatNullableMetricDelta(item.current_position, item.previous_position, "position")} / クリック差 ${formatNullableMetricDelta(item.current_clicks, item.previous_clicks, "number")}`;
  }

  if (kind === "rewrite") {
    return `表示 ${formatOptionalMetricValue(item.current_impressions, "number")} / 平均順位 ${formatOptionalMetricValue(item.current_position, "position")} / CTR ${formatOptionalMetricValue(item.current_ctr, "percent")}`;
  }

  return `出現ページ ${formatOptionalMetricValue(item.current_support_count, "number")} / 前週差 ${formatNullableMetricDelta(item.current_support_count, item.previous_support_count, "number")} / 平均順位 ${formatOptionalMetricValue(item.current_position, "position")}`;
}

function getOpportunityBadge(kind: OpportunityKind, item: OpportunityItem) {
  if (kind === "growth") {
    return {
      label: formatNullableMetricDelta(item.current_clicks, item.previous_clicks, "number"),
      tone: getDeltaTone(item.current_clicks, item.previous_clicks),
    };
  }

  if (kind === "rank-drop") {
    return {
      label: formatNullableMetricDelta(item.current_clicks, item.previous_clicks, "number"),
      tone: getDeltaTone(item.current_clicks, item.previous_clicks),
    };
  }

  if (kind === "rewrite") {
    return {
      label: `CTR ${formatOptionalMetricValue(item.current_ctr, "percent")}`,
      tone: "warn",
    };
  }

  return {
    label: `${formatOptionalMetricValue(item.current_support_count, "number")} pages`,
    tone: getDeltaTone(item.current_support_count, item.previous_support_count, "down"),
  };
}

function getComparisonCards(kind: OpportunityKind, item: OpportunityItem): ComparisonCard[] {
  if (kind === "cannibal") {
    return [
      {
        label: "出現ページ数",
        currentValue: item.current_support_count,
        previousValue: item.previous_support_count,
        format: "number",
        improveDirection: "down",
        caption: "同じ query を取り合っているページ数",
      },
      {
        label: "クリック数",
        currentValue: item.current_clicks,
        previousValue: item.previous_clicks,
        format: "number",
        improveDirection: "up",
        caption: "query 全体の獲得クリック",
      },
      {
        label: "表示回数",
        currentValue: item.current_impressions,
        previousValue: item.previous_impressions,
        format: "number",
        improveDirection: "up",
        caption: "query 全体の露出量",
      },
      {
        label: "平均掲載順位",
        currentValue: item.current_position,
        previousValue: item.previous_position,
        format: "position",
        improveDirection: "down",
        caption: "query の平均掲載順位",
      },
    ];
  }

  return [
    {
      label: "クリック数",
      currentValue: item.current_clicks,
      previousValue: item.previous_clicks,
      format: "number",
      improveDirection: "up",
      caption: "今週の獲得クリック",
    },
    {
      label: "表示回数",
      currentValue: item.current_impressions,
      previousValue: item.previous_impressions,
      format: "number",
      improveDirection: "up",
      caption: "SERP での露出量",
    },
    {
      label: "CTR",
      currentValue: item.current_ctr,
      previousValue: item.previous_ctr,
      format: "percent",
      improveDirection: "up",
      caption: "表示からクリックへの転換率",
    },
    {
      label: "平均掲載順位",
      currentValue: item.current_position,
      previousValue: item.previous_position,
      format: "position",
      improveDirection: "down",
      caption: "小さいほど良い指標",
    },
    {
      label: "Organic Sessions",
      currentValue: item.current_sessions,
      previousValue: item.previous_sessions,
      format: "number",
      improveDirection: "up",
      caption: "GA4 の自然検索流入",
    },
  ];
}

function getRuleList(kind: OpportunityKind) {
  if (kind === "growth") {
    return [...growthRuleBullets];
  }

  if (kind === "rank-drop") {
    return [...rankDropRuleBullets];
  }

  if (kind === "rewrite") {
    return [...rewriteRuleBullets];
  }

  return [
    ...cannibalRuleBullets,
  ];
}

function getEmptyMessage(
  kind: OpportunityKind,
  comparisonReady: boolean,
  fallback: string,
  activeDays: number,
  etaDate: string | null,
  readyByWindow: boolean,
) {
  if (!comparisonReady && (kind === "growth" || kind === "rank-drop")) {
    if (readyByWindow) {
      return "14日分はそろっていますが、前週比較列をまだ生成できていません。batch と mart view を確認してください。";
    }

    return `前週比較データがまだ十分にたまっていません。${getComparisonPendingMessage(activeDays, etaDate)}`;
  }

  return fallback;
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  noStore();

  const params = await searchParams;
  if (params.kind !== undefined && (typeof params.kind !== "string" || !isOpportunityKind(params.kind))) {
    notFound();
  }

  if (params.entity !== undefined && (typeof params.entity !== "string" || params.entity.length === 0)) {
    notFound();
  }

  const requestedKind = typeof params.kind === "string" ? params.kind : null;
  const requestedEntity = typeof params.entity === "string" ? params.entity : null;

  const opportunitiesResult = await getOpportunityFeedData(requestedKind, requestedEntity)
    .then((data) => ({ data, error: null as string | null }))
    .catch((error: unknown) => ({
      data: null,
      error:
        error instanceof Error ? error.message : "BigQuery から改善候補データを取得できませんでした。",
    }));

  if (!opportunitiesResult.error && opportunitiesResult.data?.requestedSelectionMissing) {
    notFound();
  }

  const selectedKind = opportunitiesResult.data?.selectedKind ?? opportunityKindOrder[0];
  const selectedGroup =
    opportunitiesResult.data?.groups.find((group) => group.kind === selectedKind) ?? null;
  const selectedItem = opportunitiesResult.data?.selectedItem ?? null;
  const comparisonReady = opportunitiesResult.data?.comparisonReady ?? false;
  const comparisonWindow = getComparisonWindowStatus(
    opportunitiesResult.data?.pageActiveDays ?? 0,
    opportunitiesResult.data?.pageLatestDate ?? opportunitiesResult.data?.referenceEndDate ?? null,
  );
  const comparisonCards =
    selectedItem && selectedGroup ? getComparisonCards(selectedGroup.kind, selectedItem) : [];
  const totalBacklog =
    opportunitiesResult.data?.groups.reduce((total, group) => total + group.totalItems, 0) ?? 0;
  const jumpLinks = [
    { href: "#summary", label: "候補タイプ" },
    { href: "#feed", label: "候補一覧" },
    { href: "#detail", label: "詳細比較" },
  ];

  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Opportunity feed</p>
          <h2>改善候補一覧</h2>
          <p className="lede">
            改善候補の種別を切り替えながら、前週比較と深掘り先を同じ画面で確認できるようにしました。
          </p>
        </div>

        {opportunitiesResult.data?.referenceEndDate ? (
          <div className="report-toolbar">
            <div className="report-filter-chip">
              <span>Active feed</span>
              <strong>{selectedGroup?.title ?? opportunityKindMeta[selectedKind].title}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Reference date</span>
              <strong>{formatDisplayDate(opportunitiesResult.data.referenceEndDate)}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Comparison</span>
              <strong>
                {getComparisonStatusLabel(
                  comparisonReady,
                  comparisonWindow.activeDays,
                  comparisonWindow.etaDate,
                  comparisonWindow.readyByWindow,
                )}
              </strong>
            </div>
          </div>
        ) : null}

        <div className="report-highlight-strip">
          <article className="report-highlight-card">
            <span className="label">Backlog</span>
            <strong>{new Intl.NumberFormat("ja-JP").format(totalBacklog)} 件</strong>
            <p>候補タイプ別の暫定ルールで拾った優先候補です。</p>
          </article>
          <article className="report-highlight-card">
            <span className="label">Selected target</span>
            <strong>{selectedItem ? getEntityTitle(selectedItem) : "候補なし"}</strong>
            <p>{selectedItem ? getEntitySecondaryText(selectedItem) : "まずは候補タイプを切り替えて確認します。"}</p>
          </article>
          <article className="report-highlight-card">
            <span className="label">Next drilldown</span>
            <strong>{selectedGroup?.drilldownLabel ?? "分析画面へ"}</strong>
            <p>{selectedItem ? getDrilldownCaption(selectedItem) : "一覧から対象を選ぶと深掘り先を表示します。"}</p>
          </article>
        </div>

        <nav className="report-jump-links" aria-label="Opportunity sections">
          {jumpLinks.map((link) => (
            <a className="report-jump-link" href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </section>

      {opportunitiesResult.error ? (
        <section className="panel report-status-card">
          <h2>BigQuery 接続エラー</h2>
          <p className="lede">
            改善候補一覧画面の読み込みに失敗しました。mart view の更新と `seo-web-runtime`
            の BigQuery 権限を確認してください。
          </p>
          <div className="error-box">
            <strong>取得エラー:</strong> <span className="mono">{opportunitiesResult.error}</span>
          </div>
        </section>
      ) : null}

      {!opportunitiesResult.error && !opportunitiesResult.data?.referenceEndDate ? (
        <section className="panel report-status-card">
          <h2>データ待ち</h2>
          <p className="lede">
            まだ改善候補一覧に使える `improvement_candidates_base` データがありません。batch
            実行と mart view の更新後に表示されます。
          </p>
        </section>
      ) : null}

      {opportunitiesResult.data ? (
        <>
          <section className="report-section" id="summary">
            <div className="report-section-header">
              <div>
                <p className="eyebrow">Candidate types</p>
                <h2>候補タイプを切り替える</h2>
              </div>
              <p className="section-caption">
                ダッシュボードの候補カードを一覧に広げ、同じ文脈で選択を続けられるようにしています。
              </p>
            </div>

            <div className="opportunity-kind-grid">
              {opportunitiesResult.data.groups.map((group) => {
                const topItem = group.items[0] ?? null;

                return (
                  <Link
                    className={`opportunity-kind-card ${group.kind === selectedKind ? "is-active" : ""}`}
                    href={getOpportunityRoute(group.kind, topItem?.entity_key)}
                    key={group.kind}
                  >
                    <div className="opportunity-kind-meta">
                      <div>
                        <span className="label">{group.shortLabel}</span>
                        <strong>{group.title}</strong>
                      </div>
                      <span className="opportunity-kind-count">
                        {new Intl.NumberFormat("ja-JP").format(group.totalItems)} 件
                      </span>
                    </div>
                    <p>{group.description}</p>
                    <p className="opportunity-kind-top">
                      <span className="label">Top target</span>
                      <strong>{topItem ? getEntityTitle(topItem) : "候補なし"}</strong>
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="article-layout" id="feed">
            <aside className="panel article-rail">
              <div className="article-rail-header">
                <div>
                  <p className="eyebrow">Opportunity index</p>
                  <h2>{selectedGroup?.title ?? "候補一覧"}</h2>
                </div>
                <span className="article-rail-count">
                  {new Intl.NumberFormat("ja-JP").format(selectedGroup?.totalItems ?? 0)} items
                </span>
              </div>

              {selectedGroup?.items.length ? (
                <div className="article-rail-list">
                  {selectedGroup.items.map((item, index) => {
                    const isActive = selectedItem?.entity_key === item.entity_key;
                    const badge = getOpportunityBadge(selectedGroup.kind, item);

                    return (
                      <Link
                        className={`article-rail-item ${isActive ? "is-active" : ""}`}
                        href={getOpportunityRoute(selectedGroup.kind, item.entity_key)}
                        key={`${selectedGroup.kind}-${item.entity_key}`}
                      >
                        <div className="article-rail-leading">
                          <span className="article-rail-rank">#{index + 1}</span>
                          <div className="article-rail-copy">
                            <strong>{getEntityTitle(item)}</strong>
                            <p>{getOpportunityStats(selectedGroup.kind, item)}</p>
                          </div>
                        </div>
                        <span className={`article-rail-delta is-${badge.tone}`}>{badge.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  {selectedGroup
                    ? getEmptyMessage(
                        selectedGroup.kind,
                        comparisonReady,
                        selectedGroup.emptyMessage,
                        comparisonWindow.activeDays,
                        comparisonWindow.etaDate,
                        comparisonWindow.readyByWindow,
                      )
                    : "候補がありません。"}
                </div>
              )}
            </aside>

            <div className="article-content">
              {selectedGroup ? (
                <section className="insight-strip">
                  <article className="panel insight-card">
                    <span className="label">Selected feed</span>
                    <strong>{selectedGroup.title}</strong>
                    <p>{selectedGroup.heuristic}</p>
                  </article>
                  <article className="panel insight-card">
                    <span className="label">Focus target</span>
                    <strong>{selectedItem ? getEntityTitle(selectedItem) : "候補なし"}</strong>
                    <p>
                      {selectedItem
                        ? getEntitySecondaryText(selectedItem)
                        : getEmptyMessage(
                            selectedGroup.kind,
                            comparisonReady,
                            selectedGroup.emptyMessage,
                            comparisonWindow.activeDays,
                            comparisonWindow.etaDate,
                            comparisonWindow.readyByWindow,
                          )}
                    </p>
                  </article>
                  <article className="panel insight-card">
                    <span className="label">Visible feed size</span>
                    <strong>
                      {selectedGroup.items.length}/{selectedGroup.totalItems}
                    </strong>
                    <p>
                      {comparisonReady
                        ? "画面では上位候補のみを先に見せています。"
                        : comparisonWindow.readyByWindow
                          ? "前週比較列の反映を確認中です。まずは rewrite / cannibal を優先して見ます。"
                          : `${getComparisonPendingMessage(
                              comparisonWindow.activeDays,
                              comparisonWindow.etaDate,
                            )} それまでは rewrite / cannibal を中心に確認します。`}
                    </p>
                  </article>
                </section>
              ) : null}

              {selectedItem && selectedGroup ? (
                <>
                  <section className="report-section" id="detail">
                    <div className="report-section-header">
                      <div>
                        <p className="eyebrow">Selected candidate</p>
                        <h2>詳細比較</h2>
                      </div>
                      <p className="section-caption">
                        まずは current_7d と previous_7d の差を見て、次に記事分析またはクエリ分析へ進みます。
                      </p>
                    </div>

                    <div className="report-grid article-detail-grid">
                      <div className="report-column">
                        <article className="panel report-panel">
                          <div className="report-panel-header">
                            <div>
                              <h3>{getEntityTitle(selectedItem)}</h3>
                              <p>{getEntitySecondaryText(selectedItem)}</p>
                            </div>
                            <span className="report-panel-tag">{selectedGroup.title}</span>
                          </div>

                          <div className="scorecard-grid">
                            {comparisonCards.map((card) => (
                              <article className="panel scorecard" key={card.label}>
                                <div className="scorecard-meta">
                                  <span className="label">{card.label}</span>
                                  <span className="scorecard-source">7d compare</span>
                                </div>
                                <strong>{formatOptionalMetricValue(card.currentValue, card.format)}</strong>
                                <p
                                  className={`scorecard-delta is-${getDeltaTone(
                                    card.currentValue,
                                    card.previousValue,
                                    card.improveDirection,
                                  )}`}
                                >
                                  {formatNullableMetricDelta(
                                    card.currentValue,
                                    card.previousValue,
                                    card.format,
                                  )}
                                </p>
                                <p className="scorecard-baseline">
                                  前週 {formatOptionalMetricValue(card.previousValue, card.format)}
                                </p>
                                <p className="scorecard-baseline">{card.caption}</p>
                              </article>
                            ))}
                          </div>
                        </article>
                      </div>

                      <div className="report-column report-column-narrow">
                        <article className="panel report-panel opportunity-action-card">
                          <div className="report-panel-header">
                            <div>
                              <h3>次の深掘り</h3>
                              <p>{getDrilldownCaption(selectedItem)}</p>
                            </div>
                            <span className="report-panel-tag">Drilldown</span>
                          </div>
                          <p className="opportunity-note">
                            一覧では優先順位までを決め、変化の中身は専用の分析画面で確認します。
                          </p>
                          <Link className="primary-button" href={getDeepDiveRoute(selectedItem)}>
                            {selectedGroup.drilldownLabel}
                          </Link>
                        </article>

                        <article className="panel report-panel opportunity-action-card">
                          <div className="report-panel-header">
                            <div>
                              <h3>暫定ルール</h3>
                              <p>Epic 5 で本判定ロジックを調整する前の一覧条件です。</p>
                            </div>
                            <span className="report-panel-tag">MVP rule</span>
                          </div>
                          <ul className="report-bullet-list">
                            {getRuleList(selectedGroup.kind).map((rule) => (
                              <li key={rule}>{rule}</li>
                            ))}
                          </ul>
                        </article>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <section className="panel report-status-card" id="detail">
                  <h2>候補なし</h2>
                  <p className="lede">
                    {selectedGroup
                      ? getEmptyMessage(
                          selectedGroup.kind,
                          comparisonReady,
                          selectedGroup.emptyMessage,
                          comparisonWindow.activeDays,
                          comparisonWindow.etaDate,
                          comparisonWindow.readyByWindow,
                        )
                      : "現在の暫定ルールに一致する改善候補がありません。別の候補タイプに切り替えて確認してください。"}
                  </p>
                </section>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
