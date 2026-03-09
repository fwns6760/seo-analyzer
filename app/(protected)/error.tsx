"use client";

import Link from "next/link";
import { useEffect } from "react";

type ProtectedErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProtectedError({ error, reset }: ProtectedErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="report-page">
      <section className="report-header-card">
        <div className="report-header-copy">
          <p className="eyebrow">Route error</p>
          <h2>分析画面の読み込みに失敗しました</h2>
          <p className="lede">
            一時的な取得失敗か、予期しない例外が発生しています。再試行しても直らない場合は
            BigQuery 権限か環境変数を確認してください。
          </p>
        </div>
      </section>

      <section className="panel report-status-card">
        <h2>Protected Route Error</h2>
        <p className="lede">
          `dashboard / articles / queries / opportunities` のいずれかで未処理エラーが発生しました。
        </p>

        {error.message ? (
          <div className="error-box">
            <strong>error.message:</strong> <span className="mono">{error.message}</span>
          </div>
        ) : null}

        <div className="status-actions">
          <button className="primary-button" onClick={() => reset()} type="button">
            再読み込み
          </button>
          <Link className="ghost-link" href="/">
            ダッシュボードへ戻る
          </Link>
        </div>
      </section>
    </div>
  );
}
