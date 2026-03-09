import Link from "next/link";

export default function RootNotFound() {
  return (
    <main className="page-shell">
      <section className="panel status-panel">
        <p className="eyebrow">Not found</p>
        <h1>ページが見つかりません</h1>
        <p className="lede">
          URL が間違っているか、まだ実装されていない画面です。ログイン後の分析画面へ戻って確認してください。
        </p>

        <div className="status-actions">
          <Link className="primary-button" href="/">
            ダッシュボードへ
          </Link>
          <Link className="ghost-link" href="/login">
            ログイン画面へ
          </Link>
        </div>
      </section>
    </main>
  );
}
