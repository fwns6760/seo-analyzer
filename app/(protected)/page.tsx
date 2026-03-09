import { unstable_noStore as noStore } from "next/cache";
import {
  getDashboardData,
  type DashboardOpportunity,
  type DashboardOverview,
} from "@/utils/dashboard";

export const dynamic = "force-dynamic";

type MetricFormat = "number" | "percent" | "position";

type MetricCard = {
  label: string;
  currentValue: number;
  previousValue: number;
  format: MetricFormat;
  source: string;
  improveDirection: "up" | "down";
};

type OpportunityGroup = {
  id: "growth" | "rank-drop" | "rewrite";
  title: string;
  description: string;
  emptyMessage: string;
  items: DashboardOpportunity[];
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

function formatMetricDelta(currentValue: number, previousValue: number, format: MetricFormat) {
  const delta = currentValue - previousValue;

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

function getDeltaTone(card: MetricCard) {
  const delta = card.currentValue - card.previousValue;

  if (delta === 0) {
    return "neutral";
  }

  if (card.improveDirection === "down") {
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

function getPageLabel(path: string) {
  if (path === "/") {
    return "トップページ";
  }

  return path;
}

function getOpportunityHref(item: DashboardOpportunity) {
  return item.entity_label.startsWith("http")
    ? item.entity_label
    : `https://yoshilover.com${item.entity_key}`;
}

function renderOpportunityStats(groupId: OpportunityGroup["id"], item: DashboardOpportunity) {
  if (groupId === "growth") {
    return `クリック ${formatMetricDelta(item.current_clicks ?? 0, item.previous_clicks ?? 0, "number")} / セッション ${formatMetricDelta(item.current_sessions ?? 0, item.previous_sessions ?? 0, "number")}`;
  }

  if (groupId === "rank-drop") {
    return `順位差 ${formatMetricDelta(item.current_position ?? 0, item.previous_position ?? 0, "position")} / クリック差 ${formatMetricDelta(item.current_clicks ?? 0, item.previous_clicks ?? 0, "number")}`;
  }

  return `表示 ${formatMetricValue(item.current_impressions ?? 0, "number")} / 平均順位 ${formatMetricValue(item.current_position ?? 0, "position")} / CTR ${formatMetricValue(item.current_ctr ?? 0, "percent")}`;
}

function getMetricCards(overview: DashboardOverview): MetricCard[] {
  return [
    {
      label: "クリック数",
      currentValue: overview.current_clicks,
      previousValue: overview.previous_clicks,
      format: "number",
      source: "Search Console",
      improveDirection: "up",
    },
    {
      label: "表示回数",
      currentValue: overview.current_impressions,
      previousValue: overview.previous_impressions,
      format: "number",
      source: "Search Console",
      improveDirection: "up",
    },
    {
      label: "CTR",
      currentValue: overview.current_ctr ?? 0,
      previousValue: overview.previous_ctr ?? 0,
      format: "percent",
      source: "Search Console",
      improveDirection: "up",
    },
    {
      label: "平均掲載順位",
      currentValue: overview.current_position ?? 0,
      previousValue: overview.previous_position ?? 0,
      format: "position",
      source: "Search Console",
      improveDirection: "down",
    },
    {
      label: "Organic Sessions",
      currentValue: overview.current_sessions,
      previousValue: overview.previous_sessions,
      format: "number",
      source: "Analytics 4",
      improveDirection: "up",
    },
    {
      label: "主要イベント",
      currentValue: overview.current_key_events,
      previousValue: overview.previous_key_events,
      format: "number",
      source: "Analytics 4",
      improveDirection: "up",
    },
  ];
}

export default async function HomePage() {
  noStore();

  const dashboardResult = await getDashboardData()
    .then((data) => ({ data, error: null as string | null }))
    .catch((error: unknown) => ({
      data: null,
      error:
        error instanceof Error ? error.message : "BigQuery からダッシュボードデータを取得できませんでした。",
    }));

  const overview = dashboardResult.data?.overview ?? null;
  const comparisonReady = overview ? overview.active_days >= 14 : false;
  const metricCards = overview ? getMetricCards(overview) : [];
  const opportunityGroups: OpportunityGroup[] = dashboardResult.data
    ? [
        {
          id: "growth",
          title: "伸びた記事",
          description: "今週の push 先を見つけるための成長候補です。",
          emptyMessage: "まだ比較できる十分な週次データがありません。",
          items: dashboardResult.data.growthItems,
        },
        {
          id: "rank-drop",
          title: "順位下落",
          description: "まず守るべきページを優先して見ます。",
          emptyMessage: "現時点で大きな下落シグナルは見つかっていません。",
          items: dashboardResult.data.rankDropItems,
        },
        {
          id: "rewrite",
          title: "リライト候補",
          description: "表示があるのに押し切れていないページです。",
          emptyMessage: "今週はリライト候補の条件に合うページがありません。",
          items: dashboardResult.data.rewriteItems,
        },
      ]
    : [];

  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Overview report</p>
          <h2>SEO Dashboard</h2>
          <p className="lede">
            Looker Studio 風の 1 枚レポートとして、今週の検索流入と改善候補を同じ視線で追えるようにしました。
          </p>
        </div>

        {overview ? (
          <div className="report-toolbar">
            <div className="report-filter-chip">
              <span>Report date</span>
              <strong>{formatDisplayDate(overview.reference_end_date)}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Data range</span>
              <strong>
                {formatDisplayDate(overview.earliest_date)} - {formatDisplayDate(overview.latest_date)}
              </strong>
            </div>
            <div className="report-filter-chip">
              <span>Comparison</span>
              <strong>{comparisonReady ? "前週比較あり" : `蓄積中 ${overview.active_days}/14日`}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {dashboardResult.error ? (
        <section className="panel report-status-card">
          <h2>BigQuery 接続エラー</h2>
          <p className="lede">
            ダッシュボードの枠組みは表示できていますが、BigQuery の取得に失敗しました。`seo-web-runtime`
            の権限と `metadata server` 経由の認証を確認してください。
          </p>
          <div className="error-box">
            <strong>取得エラー:</strong> <span className="mono">{dashboardResult.error}</span>
          </div>
        </section>
      ) : null}

      {!dashboardResult.error && !overview ? (
        <section className="panel report-status-card">
          <h2>データ待ち</h2>
          <p className="lede">
            BigQuery にまだ集計済みデータがありません。batch 実行と mart view の作成後に表示されます。
          </p>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="insight-strip">
            <article className="panel insight-card">
              <span className="label">Freshness</span>
              <strong>{formatDisplayDate(overview.reference_end_date)}</strong>
              <p>現在のレポート基準日</p>
            </article>
            <article className="panel insight-card">
              <span className="label">Matched pages</span>
              <strong>{new Intl.NumberFormat("ja-JP").format(overview.current_matched_pages)}</strong>
              <p>GA4 と GSC が重なったページ数</p>
            </article>
            <article className="panel insight-card">
              <span className="label">Organic users</span>
              <strong>{new Intl.NumberFormat("ja-JP").format(overview.current_total_users)}</strong>
              <p>今週の自然検索ユーザー</p>
            </article>
          </section>

          <section className="report-section">
            <div className="report-section-header">
              <div>
                <p className="eyebrow">Scorecards</p>
                <h2>最重要 KPI</h2>
              </div>
              <p className="section-caption">
                Looker Studio の scorecard を意識して、数字を最前面に置いた配置にしています。
              </p>
            </div>

            <div className="scorecard-grid">
              {metricCards.map((card) => (
                <article className="panel scorecard" key={card.label}>
                  <div className="scorecard-meta">
                    <span className="label">{card.label}</span>
                    <span className="scorecard-source">{card.source}</span>
                  </div>
                  <strong>{formatMetricValue(card.currentValue, card.format)}</strong>
                  {comparisonReady ? (
                    <p className={`scorecard-delta is-${getDeltaTone(card)}`}>
                      {formatMetricDelta(card.currentValue, card.previousValue, card.format)}
                    </p>
                  ) : (
                    <p className="scorecard-delta is-neutral">前週比較は 14 日蓄積後に表示</p>
                  )}
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(card.previousValue, card.format)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="report-grid">
            <div className="report-column">
              <section className="report-section">
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Opportunities</p>
                    <h2>改善候補</h2>
                  </div>
                  <p className="section-caption">
                    次に見るべきページを 3 つの観点でまとめています。
                  </p>
                </div>

                <div className="opportunity-stack">
                  {opportunityGroups.map((group) => (
                    <article className="panel report-panel" key={group.id}>
                      <div className="report-panel-header">
                        <div>
                          <h3>{group.title}</h3>
                          <p>{group.description}</p>
                        </div>
                        <span className="report-panel-tag">{group.items.length} items</span>
                      </div>

                      {group.items.length > 0 ? (
                        <ul className="opportunity-list">
                          {group.items.map((item) => (
                            <li className="opportunity-item" key={`${group.id}-${item.entity_key}`}>
                              <a href={getOpportunityHref(item)} rel="noreferrer" target="_blank">
                                {getPageLabel(item.entity_key)}
                              </a>
                              <p>{renderOpportunityStats(group.id, item)}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="empty-state">{group.emptyMessage}</div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <div className="report-column report-column-narrow">
              <section className="report-section">
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Leaderboard</p>
                    <h2>今週の上位ページ</h2>
                  </div>
                  <p className="section-caption">
                    current_7d のクリック順で並べています。
                  </p>
                </div>

                <div className="panel report-panel">
                  <div className="table-wrap">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>ページ</th>
                          <th>クリック</th>
                          <th>表示</th>
                          <th>CTR</th>
                          <th>順位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardResult.data?.topPages.map((page) => (
                          <tr key={page.page_path}>
                            <td>
                              <a href={page.canonical_url} rel="noreferrer" target="_blank">
                                {getPageLabel(page.page_path)}
                              </a>
                            </td>
                            <td>{formatMetricValue(page.clicks, "number")}</td>
                            <td>{formatMetricValue(page.impressions, "number")}</td>
                            <td>{formatMetricValue(page.ctr ?? 0, "percent")}</td>
                            <td>{formatMetricValue(page.position ?? 0, "position")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
