import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getArticleAnalysisData } from "@/utils/articles";

export const dynamic = "force-dynamic";

type ArticlePageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

function formatMetricValue(value: number, format: "number" | "percent" | "position") {
  if (format === "percent") {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (format === "position") {
    return value.toFixed(1);
  }

  return new Intl.NumberFormat("ja-JP").format(Math.round(value));
}

function formatMetricDelta(
  currentValue: number,
  previousValue: number,
  format: "number" | "percent" | "position",
) {
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

export default async function ArticleAnalysisPage({ searchParams }: ArticlePageProps) {
  noStore();

  const params = await searchParams;
  const requestedPage =
    typeof params.page === "string" && params.page.startsWith("/") ? params.page : null;

  const articleResult = await getArticleAnalysisData(requestedPage)
    .then((data) => ({ data, error: null as string | null }))
    .catch((error: unknown) => ({
      data: null,
      error:
        error instanceof Error ? error.message : "BigQuery から記事分析データを取得できませんでした。",
    }));

  const selectedPage = articleResult.data?.selectedPage ?? null;
  const comparisonReady = selectedPage ? selectedPage.previous_impressions > 0 : false;

  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Page report</p>
          <h2>記事分析</h2>
          <p className="lede">
            記事単位で、今週の検索流入、前週差、直近推移、流入クエリを 1 画面で確認します。
          </p>
        </div>

        {selectedPage ? (
          <div className="report-toolbar">
            <div className="report-filter-chip">
              <span>Selected page</span>
              <strong>{getPageLabel(selectedPage.page_path)}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Reference date</span>
              <strong>{formatDisplayDate(selectedPage.reference_end_date)}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Current 7d clicks</span>
              <strong>{formatMetricValue(selectedPage.current_clicks, "number")}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {articleResult.error ? (
        <section className="panel report-status-card">
          <h2>BigQuery 接続エラー</h2>
          <p className="lede">
            記事分析画面の読み込みに失敗しました。mart view の更新と `seo-web-runtime`
            の BigQuery 権限を確認してください。
          </p>
          <div className="error-box">
            <strong>取得エラー:</strong> <span className="mono">{articleResult.error}</span>
          </div>
        </section>
      ) : null}

      {!articleResult.error && !selectedPage ? (
        <section className="panel report-status-card">
          <h2>データ待ち</h2>
          <p className="lede">
            まだ記事分析に使える `page_daily` データがありません。batch 収集後に一覧を表示します。
          </p>
        </section>
      ) : null}

      {selectedPage ? (
        <section className="article-layout">
          <aside className="panel article-rail">
            <div className="article-rail-header">
              <div>
                <p className="eyebrow">Page index</p>
                <h2>記事一覧</h2>
              </div>
              <span className="article-rail-count">
                {articleResult.data?.leaderboard.length ?? 0} pages
              </span>
            </div>

            <div className="article-rail-list">
              {articleResult.data?.leaderboard.map((page) => {
                const isActive = page.page_path === selectedPage.page_path;

                return (
                  <Link
                    className={`article-rail-item ${isActive ? "is-active" : ""}`}
                    href={{
                      pathname: "/articles",
                      query: {
                        page: page.page_path,
                      },
                    }}
                    key={page.page_path}
                  >
                    <div className="article-rail-copy">
                      <strong>{getPageLabel(page.page_path)}</strong>
                      <p>
                        クリック {formatMetricValue(page.current_clicks, "number")} / Sessions{" "}
                        {formatMetricValue(page.current_sessions, "number")}
                      </p>
                    </div>
                    <span className="article-rail-delta">
                      {formatMetricDelta(page.current_clicks, page.previous_clicks, "number")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="article-content">
            <section className="insight-strip">
              <article className="panel insight-card">
                <span className="label">Selected article</span>
                <strong>{getPageLabel(selectedPage.page_path)}</strong>
                <p>{selectedPage.canonical_url}</p>
              </article>
              <article className="panel insight-card">
                <span className="label">7d clicks</span>
                <strong>{formatMetricValue(selectedPage.current_clicks, "number")}</strong>
                <p>前週差 {formatMetricDelta(selectedPage.current_clicks, selectedPage.previous_clicks, "number")}</p>
              </article>
              <article className="panel insight-card">
                <span className="label">Tracked days</span>
                <strong>{articleResult.data?.trend.length ?? 0} 日</strong>
                <p>直近 14 日の履歴と流入クエリを表示</p>
              </article>
            </section>

            <section className="report-section">
              <div className="report-section-header">
                <div>
                  <p className="eyebrow">Scorecards</p>
                  <h2>ページ KPI</h2>
                </div>
                <p className="section-caption">
                  記事単位の scorecard です。前週比較がまだない期間は今週値だけを見ます。
                </p>
              </div>

              <div className="scorecard-grid">
                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">クリック数</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedPage.current_clicks, "number")}</strong>
                  <p className={`scorecard-delta ${comparisonReady ? "is-good" : "is-neutral"}`}>
                    {comparisonReady
                      ? formatMetricDelta(selectedPage.current_clicks, selectedPage.previous_clicks, "number")
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedPage.previous_clicks, "number")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">表示回数</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedPage.current_impressions, "number")}</strong>
                  <p className={`scorecard-delta ${comparisonReady ? "is-neutral" : "is-neutral"}`}>
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedPage.current_impressions,
                          selectedPage.previous_impressions,
                          "number",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedPage.previous_impressions, "number")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">平均掲載順位</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedPage.current_position ?? 0, "position")}</strong>
                  <p className={`scorecard-delta ${comparisonReady ? "is-neutral" : "is-neutral"}`}>
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedPage.current_position ?? 0,
                          selectedPage.previous_position ?? 0,
                          "position",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedPage.previous_position ?? 0, "position")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">Organic Sessions</span>
                    <span className="scorecard-source">Analytics 4</span>
                  </div>
                  <strong>{formatMetricValue(selectedPage.current_sessions, "number")}</strong>
                  <p className={`scorecard-delta ${comparisonReady ? "is-good" : "is-neutral"}`}>
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedPage.current_sessions,
                          selectedPage.previous_sessions,
                          "number",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedPage.previous_sessions, "number")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">Organic Users</span>
                    <span className="scorecard-source">Analytics 4</span>
                  </div>
                  <strong>{formatMetricValue(selectedPage.current_total_users, "number")}</strong>
                  <p className={`scorecard-delta ${comparisonReady ? "is-good" : "is-neutral"}`}>
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedPage.current_total_users,
                          selectedPage.previous_total_users,
                          "number",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedPage.previous_total_users, "number")}
                  </p>
                </article>
              </div>
            </section>

            <section className="report-grid article-detail-grid">
              <section className="report-section report-column">
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Daily timeline</p>
                    <h2>直近 14 日の推移</h2>
                  </div>
                  <p className="section-caption">
                    Search Console と Analytics 4 が両方あるかも日別で確認できます。
                  </p>
                </div>

                <div className="panel report-panel">
                  <div className="table-wrap">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>日付</th>
                          <th>クリック</th>
                          <th>表示</th>
                          <th>CTR</th>
                          <th>順位</th>
                          <th>Sessions</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articleResult.data?.trend.map((point) => (
                          <tr key={point.data_date}>
                            <td>{formatDisplayDate(point.data_date)}</td>
                            <td>{formatMetricValue(point.clicks ?? 0, "number")}</td>
                            <td>{formatMetricValue(point.impressions ?? 0, "number")}</td>
                            <td>{formatMetricValue(point.ctr ?? 0, "percent")}</td>
                            <td>{formatMetricValue(point.position ?? 0, "position")}</td>
                            <td>{formatMetricValue(point.sessions ?? 0, "number")}</td>
                            <td>{point.source_match_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="report-section report-column report-column-narrow">
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Top queries</p>
                    <h2>流入クエリ</h2>
                  </div>
                  <p className="section-caption">
                    `page_query_daily` から、このページを押している検索語を見ます。
                  </p>
                </div>

                <div className="panel report-panel">
                  {articleResult.data?.queries.length ? (
                    <div className="table-wrap">
                      <table className="dashboard-table query-breakdown-table">
                        <thead>
                          <tr>
                            <th>クエリ</th>
                            <th>クリック</th>
                            <th>表示</th>
                            <th>CTR</th>
                            <th>順位</th>
                          </tr>
                        </thead>
                        <tbody>
                          {articleResult.data?.queries.map((item) => (
                            <tr key={item.query}>
                              <td>{item.query}</td>
                              <td>{formatMetricValue(item.clicks, "number")}</td>
                              <td>{formatMetricValue(item.impressions, "number")}</td>
                              <td>{formatMetricValue(item.ctr ?? 0, "percent")}</td>
                              <td>{formatMetricValue(item.position ?? 0, "position")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      このページに紐づく `page_query_daily` データがまだありません。
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        </section>
      ) : null}
    </div>
  );
}
