"use client";

import Link from "next/link";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main className="page-shell">
          <section className="panel status-panel">
            <p className="eyebrow">Global error</p>
            <h1>アプリ全体で予期しないエラーが発生しました</h1>
            <p className="lede">
              login/auth を含む上位ルートで未処理エラーが発生しています。再試行しても直らない場合は環境変数と認証設定を確認してください。
            </p>

            {error.message ? (
              <div className="error-box">
                <strong>error.message:</strong> <span className="mono">{error.message}</span>
              </div>
            ) : null}

            <div className="status-actions">
              <button className="primary-button" onClick={() => reset()} type="button">
                再試行
              </button>
              <Link className="ghost-link" href="/login">
                ログイン画面へ
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
