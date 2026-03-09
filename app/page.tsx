import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import {
  getDashboardData,
  type DashboardOpportunity,
  type DashboardOverview,
} from "@/utils/dashboard";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type MetricFormat = "number" | "percent" | "position";

type MetricCard = {
  label: string;
  currentValue: number;
  previousValue: number;
  format: MetricFormat;
  helper: string;
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
      helper: "Google Search Console",
      improveDirection: "up",
    },
    {
      label: "表示回数",
      currentValue: overview.current_impressions,
      previousValue: overview.previous_impressions,
      format: "number",
      helper: "Google Search Console",
      improveDirection: "up",
    },
    {
      label: "CTR",
      currentValue: overview.current_ctr ?? 0,
      previousValue: overview.previous_ctr ?? 0,
      format: "percent",
      helper: "クリック率",
      improveDirection: "up",
    },
    {
      label: "平均掲載順位",
      currentValue: overview.current_position ?? 0,
      previousValue: overview.previous_position ?? 0,
      format: "position",
      helper: "低いほど良い",
      improveDirection: "down",
    },
    {
      label: "Organic Sessions",
      currentValue: overview.current_sessions,
      previousValue: overview.previous_sessions,
      format: "number",
      helper: "Google Analytics 4",
      improveDirection: "up",
    },
    {
      label: "主要イベント",
      currentValue: overview.current_key_events,
      previousValue: overview.previous_key_events,
      format: "number",
      helper: "Google Analytics 4",
      improveDirection: "up",
    },
  ];
}

export default async function HomePage() {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/");
  }

  const [profileResult, dashboardResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getDashboardData()
      .then((data) => ({ data, error: null as string | null }))
      .catch((error: unknown) => ({
        data: null,
        error:
          error instanceof Error ? error.message : "BigQuery からダッシュボードデータを取得できませんでした。",
      })),
  ]);

  const overview = dashboardResult.data?.overview ?? null;
  const comparisonReady = overview ? overview.active_days >= 14 : false;
  const metricCards = overview ? getMetricCards(overview) : [];
  const opportunityGroups: OpportunityGroup[] = dashboardResult.data
    ? [
        {
          id: "growth",
          title: "伸びた記事",
          description: "直近7日でクリックとセッションが増えているページ。",
          emptyMessage: "まだ比較できる十分な週次データがありません。",
          items: dashboardResult.data.growthItems,
        },
        {
          id: "rank-drop",
          title: "順位下落",
          description: "掲載順位が悪化したページを先に確認します。",
          emptyMessage: "現時点で大きな下落シグナルは見つかっていません。",
          items: dashboardResult.data.rankDropItems,
        },
        {
          id: "rewrite",
          title: "リライト候補",
          description: "表示回数はあるのに押し切れていないページです。",
          emptyMessage: "今週はリライト候補の条件に合うページがありません。",
          items: dashboardResult.data.rewriteItems,
        },
      ]
    : [];

  return (
    <main className="page-shell dashboard-shell">
      <section className="panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">E4-T1 Dashboard</p>
          <h1>SEO Dashboard</h1>
          <p className="lede">
            yoshilover.com の直近7日を、検索流入と改善候補の両方から一度に見ます。
          </p>

          {overview ? (
            <div className="hero-pills">
              <span className="pill">基準日 {formatDisplayDate(overview.reference_end_date)}</span>
              <span className="pill">
                データ期間 {formatDisplayDate(overview.earliest_date)} - {formatDisplayDate(overview.latest_date)}
              </span>
              <span className={`pill ${comparisonReady ? "pill-strong" : "pill-muted"}`}>
                {comparisonReady
                  ? "前週比較あり"
                  : `前週比較は蓄積中 (${overview.active_days}/14日)`}
              </span>
            </div>
          ) : null}
        </div>

        <aside className="hero-aside">
          <div className="hero-user-card">
            <span className="label">ログイン</span>
            <strong>{profileResult.data?.full_name ?? user.email ?? "Unknown user"}</strong>
            <p>{user.email}</p>

            {overview ? (
              <dl className="hero-inline-stats">
                <div>
                  <dt>GA4+GSC一致</dt>
                  <dd>{new Intl.NumberFormat("ja-JP").format(overview.current_matched_pages)} pages</dd>
                </div>
                <div>
                  <dt>Organic users</dt>
                  <dd>{new Intl.NumberFormat("ja-JP").format(overview.current_total_users)}</dd>
                </div>
              </dl>
            ) : null}

            <form action="/auth/signout" method="post">
              <button className="primary-button" type="submit">
                ログアウト
              </button>
            </form>
          </div>
        </aside>
      </section>

      {dashboardResult.error ? (
        <section className="panel status-panel">
          <h2>BigQuery 接続エラー</h2>
          <p className="lede">
            ダッシュボードの表示は認証済みですが、BigQuery の取得に失敗しました。
            `seo-web-runtime` に BigQuery 読み取り権限が入っているか確認してください。
          </p>
          <div className="error-box">
            <strong>取得エラー:</strong> <span className="mono">{dashboardResult.error}</span>
          </div>
        </section>
      ) : null}

      {!dashboardResult.error && !overview ? (
        <section className="panel status-panel">
          <h2>データ待ち</h2>
          <p className="lede">
            BigQuery にまだ集計済みデータがありません。batch 実行と mart view の作成後に表示されます。
          </p>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="dashboard-meta-grid">
            <article className="panel meta-card">
              <span className="label">データ鮮度</span>
              <strong>{formatDisplayDate(overview.reference_end_date)}</strong>
              <p>直近7日の集計基準日です。</p>
            </article>
            <article className="panel meta-card">
              <span className="label">蓄積日数</span>
              <strong>{new Intl.NumberFormat("ja-JP").format(overview.active_days)} 日</strong>
              <p>前週比較は 14 日以上で安定して見られます。</p>
            </article>
            <article className="panel meta-card">
              <span className="label">一致ページ</span>
              <strong>{new Intl.NumberFormat("ja-JP").format(overview.current_matched_pages)}</strong>
              <p>Google Search Console と Google Analytics 4 の両方が取れているページ数。</p>
            </article>
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Overview</p>
                <h2>最重要 KPI</h2>
              </div>
              <p className="section-caption">
                {comparisonReady
                  ? "直近7日と前の7日を比較します。"
                  : "前週比較はまだ育成中なので、まずは今週の絶対値を見ます。"}
              </p>
            </div>

            <div className="metric-grid">
              {metricCards.map((card) => (
                <article className="panel metric-card" key={card.label}>
                  <span className="label">{card.label}</span>
                  <strong>{formatMetricValue(card.currentValue, card.format)}</strong>
                  <p>{card.helper}</p>
                  {comparisonReady ? (
                    <>
                      <p className="metric-baseline">
                        前週 {formatMetricValue(card.previousValue, card.format)}
                      </p>
                      <p className={`metric-delta metric-delta-${getDeltaTone(card)}`}>
                        {formatMetricDelta(card.currentValue, card.previousValue, card.format)}
                      </p>
                    </>
                  ) : (
                    <p className="metric-baseline">前週比は 14 日蓄積後に表示</p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Opportunities</p>
                <h2>改善候補</h2>
              </div>
              <p className="section-caption">
                page 単位の mart view から、今すぐ見たいページを 3 方向で抽出しています。
              </p>
            </div>

            <div className="opportunity-grid">
              {opportunityGroups.map((group) => (
                <article className="panel opportunity-card" key={group.id}>
                  <div className="opportunity-card-header">
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>

                  {group.items.length > 0 ? (
                    <ul className="opportunity-list">
                      {group.items.map((item) => (
                        <li className="opportunity-item" key={`${group.id}-${item.entity_key}`}>
                          <a
                            href={getOpportunityHref(item)}
                            rel="noreferrer"
                            target="_blank"
                          >
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

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Top Pages</p>
                <h2>今週の上位ページ</h2>
              </div>
              <p className="section-caption">
                current_7d のクリック順です。公開記事へそのまま飛べます。
              </p>
            </div>

            <div className="panel table-panel">
              <div className="table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>ページ</th>
                      <th>クリック</th>
                      <th>表示</th>
                      <th>CTR</th>
                      <th>平均順位</th>
                      <th>Sessions</th>
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
                        <td>{formatMetricValue(page.sessions, "number")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
