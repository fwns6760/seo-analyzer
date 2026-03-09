"use client";

import Link from "next/link";
import { useEffect } from "react";

type RootErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-shell">
      <section className="panel status-panel">
        <p className="eyebrow">Application error</p>
        <h1>ページの読み込みに失敗しました</h1>
        <p className="lede">
          ログイン画面や認証 callback を含む公開ルートで未処理エラーが発生しています。再試行しても直らない場合は
          Supabase 設定と環境変数を確認してください。
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
  );
}
