import Link from "next/link";

export default function ProtectedNotFound() {
  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Not found</p>
          <h2>指定された分析対象が見つかりません</h2>
          <p className="lede">
            URL の `page / query / entity` が存在しないか、最新の集計対象から外れています。
          </p>
        </div>
      </section>

      <section className="panel report-status-card">
        <h2>候補や分析対象が見つかりません</h2>
        <p className="lede">
          一覧から再選択するか、ダッシュボードに戻って別の導線から入り直してください。
        </p>

        <div className="status-actions">
          <Link className="primary-button" href="/">
            ダッシュボードへ戻る
          </Link>
          <Link className="ghost-link" href="/opportunities">
            改善候補一覧へ
          </Link>
        </div>
      </section>
    </div>
  );
}
