import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { getQueryAnalysisData } from "@/utils/queries";

export const dynamic = "force-dynamic";

type QueryPageProps = {
  searchParams: Promise<{
    query?: string;
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

function getDeltaTone(
  currentValue: number,
  previousValue: number,
  improveDirection: "up" | "down" = "up",
) {
  const delta = currentValue - previousValue;

  if (delta === 0) {
    return "is-neutral";
  }

  if (improveDirection === "down") {
    return delta < 0 ? "is-good" : "is-bad";
  }

  return delta > 0 ? "is-good" : "is-bad";
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

export default async function QueryAnalysisPage({ searchParams }: QueryPageProps) {
  noStore();

  const params = await searchParams;
  if (params.query !== undefined && (typeof params.query !== "string" || params.query.length === 0)) {
    notFound();
  }

  const requestedQuery = typeof params.query === "string" ? params.query : null;

  const queryResult = await getQueryAnalysisData(requestedQuery)
    .then((data) => ({ data, error: null as string | null }))
    .catch((error: unknown) => ({
      data: null,
      error:
        error instanceof Error ? error.message : "BigQuery からクエリ分析データを取得できませんでした。",
    }));

  if (!queryResult.error && queryResult.data?.requestedSelectionMissing) {
    notFound();
  }

  const selectedQuery = queryResult.data?.selectedQuery ?? null;
  const comparisonReady = selectedQuery ? selectedQuery.previous_impressions > 0 : false;
  const topPage = queryResult.data?.pages[0] ?? null;
  const multiPageDays =
    queryResult.data?.trend.filter((point) => point.has_multiple_pages).length ?? 0;
  const jumpLinks = [
    { href: "#query-kpi", label: "KPI" },
    { href: "#query-timeline", label: "推移" },
    { href: "#query-pages", label: "紐づくページ" },
  ];

  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Query report</p>
          <h2>クエリ分析</h2>
          <p className="lede">
            検索クエリ単位で、今週の獲得状況、前週差、日次推移、紐づくページを確認します。
          </p>
        </div>

        {selectedQuery ? (
          <div className="report-toolbar">
            <div className="report-filter-chip">
              <span>Selected query</span>
              <strong>{selectedQuery.query}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Reference date</span>
              <strong>{formatDisplayDate(selectedQuery.reference_end_date)}</strong>
            </div>
            <div className="report-filter-chip">
              <span>Current 7d clicks</span>
              <strong>{formatMetricValue(selectedQuery.current_clicks, "number")}</strong>
            </div>
          </div>
        ) : null}

        {selectedQuery ? (
          <div className="report-highlight-strip">
            <article className="report-highlight-card">
              <span className="label">Intent focus</span>
              <strong>{selectedQuery.query}</strong>
              <p>この検索語をどのページが取っているかを先に整理します。</p>
            </article>
            <article className="report-highlight-card">
              <span className="label">Primary page</span>
              <strong>{topPage?.page_path ?? "まだ抽出なし"}</strong>
              <p>
                {topPage
                  ? `クリック ${formatMetricValue(topPage.clicks, "number")} / active ${topPage.active_days}日`
                  : "page_query_daily の蓄積待ちです。"}
              </p>
            </article>
            <article className="report-highlight-card">
              <span className="label">Spread signal</span>
              <strong>
                {selectedQuery.max_page_count >= 2 ? "複数ページに分散" : "単一ページ中心"}
              </strong>
              <p>{multiPageDays} 日で複数ページ出現。カニバリ予兆の確認に使えます。</p>
            </article>
          </div>
        ) : null}

        <nav className="report-jump-links" aria-label="Query sections">
          {jumpLinks.map((link) => (
            <a className="report-jump-link" href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </section>

      {queryResult.error ? (
        <section className="panel report-status-card">
          <h2>BigQuery 接続エラー</h2>
          <p className="lede">
            クエリ分析画面の読み込みに失敗しました。mart view の更新と `seo-web-runtime`
            の BigQuery 権限を確認してください。
          </p>
          <div className="error-box">
            <strong>取得エラー:</strong> <span className="mono">{queryResult.error}</span>
          </div>
        </section>
      ) : null}

      {!queryResult.error && !selectedQuery ? (
        <section className="panel report-status-card">
          <h2>データ待ち</h2>
          <p className="lede">
            まだクエリ分析に使える `query_daily` データがありません。batch 収集後に一覧を表示します。
          </p>
        </section>
      ) : null}

      {selectedQuery ? (
        <section className="article-layout">
          <aside className="panel article-rail">
            <div className="article-rail-header">
              <div>
                <p className="eyebrow">Query index</p>
                <h2>クエリ一覧</h2>
              </div>
              <span className="article-rail-count">
                {queryResult.data?.leaderboard.length ?? 0} queries
              </span>
            </div>

            <div className="article-rail-list">
              {queryResult.data?.leaderboard.map((queryItem, index) => {
                const isActive = queryItem.query === selectedQuery.query;

                return (
                  <Link
                    className={`article-rail-item ${isActive ? "is-active" : ""}`}
                    href={{
                      pathname: "/queries",
                      query: {
                        query: queryItem.query,
                      },
                    }}
                    key={queryItem.query}
                  >
                    <div className="article-rail-leading">
                      <span className="article-rail-rank">#{index + 1}</span>
                      <div className="article-rail-copy">
                        <strong>{queryItem.query}</strong>
                        <p>
                          クリック {formatMetricValue(queryItem.current_clicks, "number")} / 表示{" "}
                          {formatMetricValue(queryItem.current_impressions, "number")}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`article-rail-delta ${getDeltaTone(
                        queryItem.current_clicks,
                        queryItem.previous_clicks,
                      )}`}
                    >
                      {formatMetricDelta(queryItem.current_clicks, queryItem.previous_clicks, "number")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="article-content">
            <section className="insight-strip">
              <article className="panel insight-card">
                <span className="label">Selected query</span>
                <strong>{selectedQuery.query}</strong>
                <p>
                  top page {selectedQuery.top_page_path ?? "未特定"} / max page count{" "}
                  {formatMetricValue(selectedQuery.max_page_count, "number")}
                </p>
              </article>
              <article className="panel insight-card">
                <span className="label">7d clicks</span>
                <strong>{formatMetricValue(selectedQuery.current_clicks, "number")}</strong>
                <p>
                  前週差{" "}
                  {formatMetricDelta(
                    selectedQuery.current_clicks,
                    selectedQuery.previous_clicks,
                    "number",
                  )}
                </p>
              </article>
              <article className="panel insight-card">
                <span className="label">Tracked days</span>
                <strong>{queryResult.data?.trend.length ?? 0} 日</strong>
                <p>直近 14 日の履歴と紐づくページ一覧を表示</p>
              </article>
            </section>

            <section className="report-section" id="query-kpi">
              <div className="report-section-header">
                <div>
                  <p className="eyebrow">Scorecards</p>
                  <h2>クエリ KPI</h2>
                </div>
                <p className="section-caption">
                  query_daily を使って、クエリ単位のクリック・表示・CTR・順位をまとめています。
                </p>
              </div>

              <div className="scorecard-grid">
                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">クリック数</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedQuery.current_clicks, "number")}</strong>
                  <p
                    className={`scorecard-delta ${
                      comparisonReady
                        ? getDeltaTone(selectedQuery.current_clicks, selectedQuery.previous_clicks)
                        : "is-neutral"
                    }`}
                  >
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedQuery.current_clicks,
                          selectedQuery.previous_clicks,
                          "number",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedQuery.previous_clicks, "number")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">表示回数</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedQuery.current_impressions, "number")}</strong>
                  <p
                    className={`scorecard-delta ${
                      comparisonReady
                        ? getDeltaTone(
                            selectedQuery.current_impressions,
                            selectedQuery.previous_impressions,
                          )
                        : "is-neutral"
                    }`}
                  >
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedQuery.current_impressions,
                          selectedQuery.previous_impressions,
                          "number",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedQuery.previous_impressions, "number")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">CTR</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedQuery.current_ctr ?? 0, "percent")}</strong>
                  <p
                    className={`scorecard-delta ${
                      comparisonReady
                        ? getDeltaTone(selectedQuery.current_ctr ?? 0, selectedQuery.previous_ctr ?? 0)
                        : "is-neutral"
                    }`}
                  >
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedQuery.current_ctr ?? 0,
                          selectedQuery.previous_ctr ?? 0,
                          "percent",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedQuery.previous_ctr ?? 0, "percent")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">平均掲載順位</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedQuery.current_position ?? 0, "position")}</strong>
                  <p
                    className={`scorecard-delta ${
                      comparisonReady
                        ? getDeltaTone(
                            selectedQuery.current_position ?? 0,
                            selectedQuery.previous_position ?? 0,
                            "down",
                          )
                        : "is-neutral"
                    }`}
                  >
                    {comparisonReady
                      ? formatMetricDelta(
                          selectedQuery.current_position ?? 0,
                          selectedQuery.previous_position ?? 0,
                          "position",
                        )
                      : "前週比較は蓄積中"}
                  </p>
                  <p className="scorecard-baseline">
                    前週 {formatMetricValue(selectedQuery.previous_position ?? 0, "position")}
                  </p>
                </article>

                <article className="panel scorecard">
                  <div className="scorecard-meta">
                    <span className="label">Page count</span>
                    <span className="scorecard-source">Search Console</span>
                  </div>
                  <strong>{formatMetricValue(selectedQuery.max_page_count, "number")}</strong>
                  <p
                    className={`scorecard-delta ${
                      selectedQuery.max_page_count >= 2 ? "is-warn" : "is-good"
                    }`}
                  >
                    {selectedQuery.max_page_count >= 2
                      ? "複数ページに分散"
                      : "単一ページ中心"}
                  </p>
                  <p className="scorecard-baseline">current_7d 最大値</p>
                </article>
              </div>
            </section>

            <section className="report-grid article-detail-grid">
              <section className="report-section report-column" id="query-timeline">
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Daily timeline</p>
                    <h2>直近 14 日の推移</h2>
                  </div>
                  <p className="section-caption">
                    日別の page_count と top page も同時に確認できます。
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
                          <th>Page count</th>
                          <th>Top page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.data?.trend.map((point) => (
                          <tr key={point.data_date}>
                            <td>{formatDisplayDate(point.data_date)}</td>
                            <td>{formatMetricValue(point.clicks, "number")}</td>
                            <td>{formatMetricValue(point.impressions, "number")}</td>
                            <td>{formatMetricValue(point.ctr ?? 0, "percent")}</td>
                            <td>{formatMetricValue(point.position ?? 0, "position")}</td>
                            <td>{formatMetricValue(point.page_count, "number")}</td>
                            <td>{point.top_page_path ?? "NULL"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section
                className="report-section report-column report-column-narrow"
                id="query-pages"
              >
                <div className="report-section-header">
                  <div>
                    <p className="eyebrow">Page distribution</p>
                    <h2>紐づくページ</h2>
                  </div>
                  <p className="section-caption">
                    page_query_daily の集計です。記事分析へそのまま飛べます。
                  </p>
                </div>

                <div className="panel report-panel">
                  {queryResult.data?.pages.length ? (
                    <div className="table-wrap">
                      <table className="dashboard-table query-breakdown-table">
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
                          {queryResult.data.pages.map((page) => (
                            <tr key={page.page_path}>
                              <td>
                                <Link
                                  href={{
                                    pathname: "/articles",
                                    query: {
                                      page: page.page_path,
                                    },
                                  }}
                                >
                                  {page.page_path}
                                </Link>
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
                  ) : (
                    <div className="empty-state">
                      このクエリに紐づく `page_query_daily` データがまだありません。
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
