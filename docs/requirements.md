# SEO分析サイト MVP 要件定義

## 1. 目的
- yoshilover.com の検索順位監視
- 流入減少の原因発見
- リライト候補抽出
- カニバリ候補抽出

## 2. 利用者
- 自分のみ

## 3. 対象サイト
- yoshilover.com

## 4. 連携データ
- Google Search Console
- Google Analytics 4

## 5. 最重要指標
- クリック数
- 表示回数
- CTR
- 平均掲載順位
- 自然検索CVまたは主要イベント

## 6. 分析単位
- サイト全体
- 記事別
- クエリ別
- カテゴリ別

## 7. MVP 必須画面
- ダッシュボード
- 記事分析画面
- クエリ分析画面
- 改善候補一覧画面

## 8. 自動分析
- 順位下落ページ
- 伸びた記事
- リライト候補
- カニバリ候補

## 9. MVP 成功条件
- 毎週の手集計が不要になる
- 改善対象がすぐ分かる
- 社内共有できる

## 10. 技術要件
- GCP を使う
- Next.js App Router を使う
- 認証は Supabase Auth + Google OAuth
- 本番実行基盤は Cloud Run
- データ蓄積は BigQuery
- 定期取得は Cloud Run Jobs + Cloud Scheduler
- 秘密情報は Secret Manager

## 11. Next.js 実装方針
- App Router を使う
- `page.tsx` / `layout.tsx` は原則 Server Component
- Client Component は最小限
- データ取得は server 側を基本とする
- loading / error / not-found を設計する

## 12. Supabase 認証方針
- Supabase Auth を使う
- Google OAuth を使う
- 自分専用の管理画面にする
- browser 用 client と server 用 client を分ける

## 13. GCP 構成
- Web アプリ: Cloud Run
- SEO データ取得バッチ: Cloud Run Jobs
- 定期実行: Cloud Scheduler
- 保存先: BigQuery
- シークレット: Secret Manager
- ログ監視: Cloud Logging / Cloud Monitoring

## 14. MVP 対象外
- 複数ユーザー権限
- 被リンク分析
- 競合自動クロール
- AI 自動執筆
- 高度なレポート自動生成
