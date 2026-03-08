import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="page-shell">
      <section className="panel status-panel">
        <p className="eyebrow">Auth Error</p>
        <h1>認証コード交換に失敗しました</h1>
        <p className="lede">
          Google OAuth の callback で code exchange が失敗した場合の退避ページです。
        </p>
        <Link className="ghost-link" href="/">
          ホームへ戻る
        </Link>
      </section>
    </main>
  );
}
