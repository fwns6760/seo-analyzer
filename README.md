# SEO Analyzer

`yoshilover.com` 向けの SEO 分析 Web アプリです。  
`Google Search Console` と `Google Analytics 4` のデータを `BigQuery` に蓄積し、検索流入の監視と改善候補の抽出を行います。

## このリポジトリでやったこと

- `Google Search Console` と `Google Analytics 4` の日次データ取得 batch を実装
- 取得データを `BigQuery` に保存し、画面向け mart を作成
- `Supabase Auth + Google OAuth` で自分専用の管理画面を構築
- `Dashboard / Articles / Queries / Opportunities` の 4 画面を実装
- `順位下落 / 伸びた記事 / リライト / カニバリ` の改善候補ロジックを実装
- `GitHub Actions + Workload Identity Federation` で `Cloud Run` / `Cloud Run Jobs` へ自動デプロイ
- `npm run data:readiness` で前週比較の準備状態を確認できるようにした

## 実装済み

- `Supabase Auth + Google OAuth` による保護ログイン
- `Next.js App Router` ベースの管理画面
- `SEO Dashboard`
  - 主要 KPI
  - 上位ページ
  - 改善候補サマリー
- `記事分析`
  - ページ別 KPI
  - 直近 14 日推移
  - 流入クエリ一覧
- `クエリ分析`
  - クエリ別 KPI
  - 直近 14 日推移
  - 紐づくページ一覧
- `改善候補一覧`
  - 順位下落
  - 伸びた記事
  - リライト候補
  - カニバリ候補
- `loading / error / not-found` 対応
- `Cloud Run Jobs + Cloud Scheduler` による日次データ取得
- `GitHub Actions + Workload Identity Federation` による本番自動デプロイ
- `npm run data:readiness` による raw / mart / 前週比較 ready 状態の確認

## 技術構成

- `Next.js`
- `TypeScript`
- `Supabase Auth`
- `Google OAuth`
- `Google Search Console API`
- `Google Analytics Data API`
- `BigQuery`
- `Cloud Run`
- `Cloud Run Jobs`
- `Cloud Scheduler`
- `Secret Manager`
- `GitHub Actions`

## 画面

- `/login`
- `/`
- `/articles`
- `/queries`
- `/opportunities`

## データフロー

1. `Cloud Scheduler` が `Cloud Run Jobs` の batch を起動
2. batch が `Google Search Console` / `Google Analytics 4` から日次データを取得
3. 取得結果を `BigQuery raw` に保存
4. `page_daily` / `query_daily` / `category_daily` / `improvement_candidates_base` で集計
5. `Cloud Run` 上の Web アプリが `BigQuery` を直接参照して画面表示

## ローカル起動

前提:

- `Node.js 20+`
- `gcloud` 認証済み、または `BigQuery` / OAuth 用の必要な環境変数が設定済み
- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を配置済み

よく使うコマンド:

```bash
npm install
npm run dev
npm run build
npm run batch:job:dry-run
npm run data:readiness
```

ローカル URL:

- Web: `http://localhost:3000`
- Login: `http://localhost:3000/login`

## 本番

- Web: `https://seo-analyzer-web-n5hunzkyna-an.a.run.app`
- Deploy: `main` push で `GitHub Actions` が `Cloud Run` / `Cloud Run Jobs` を更新

## 現在の状態

- `MVP` 実装タスクは完了
- 残りは運用確認で、前週比較データが十分に蓄積した後に候補件数と閾値を再確認する段階

## 正本ドキュメント

- 要件: `docs/requirements.md`
- 進捗: `TASKS.md`
- 実装判断ログ: `docs/PLANS.md`
- データ契約: `docs/data_source_contract.md`
- OAuth 設定メモ: `docs/google_oauth_setup.md`
