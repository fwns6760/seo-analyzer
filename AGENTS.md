# AGENTS.md

## Project
このリポジトリは、yoshilover.com 向けの SEO 分析 Web アプリを構築するためのものです。

## Source of truth
- 要件定義の正本は `docs/requirements.md`
- タスク進捗の正本は `TASKS.md`
- 実装計画の正本は `PLANS.md`

## Tech stack
- Next.js App Router
- TypeScript
- Supabase Auth
- Google OAuth
- GCP
- Cloud Run
- BigQuery
- Cloud Run Jobs
- Cloud Scheduler
- Secret Manager

## Rules
- Pages Router は使わない
- App Router を使う
- `page.tsx` と `layout.tsx` は原則 Server Component
- Client Component は最小限
- 認証は Supabase Auth + Google OAuth
- データ取得は定期バッチで行い、BigQuery に保存する
- 本番の秘密情報は Secret Manager を使う
- MVP を優先し、過剰実装しない

## Workflow
- 作業開始前に `docs/requirements.md` と `TASKS.md` を読む
- 大きな変更の前に `PLANS.md` を確認または更新する
- 着手したら `TASKS.md` の status を更新する
- 完了したら `TASKS.md` の Done log を更新する

## Learning mode for GCP
- この案件では「最短実装」だけでなく「GCPを学ぶこと」も目的にする
- GCPに関わる変更を行うときは、実装前または実装直後に短く説明を入れる
- 説明には必ず次を含める
  - 何をするか
  - なぜそのGCPサービスを使うか
  - 代替案は何か
  - 今回はなぜその案を選ぶか
  - 実行コマンドの意味
  - 次に確認するポイント
- 説明は初心者向けに、日本語で、短く具体的に書く
- GCPサービス名は省略しすぎず、正式名を最初に書く
- 1回の変更ごとに「変更内容」「学習ポイント」「次にやること」を3点でまとめる
- 実装だけして終わらず、学習用の説明を必ず残す

## Progress and explanation update rule
- GCPに関する作業をしたら、TASKS.md の該当タスク更新に加えて、説明を残す
- 長い説明や判断理由は PLANS.md に追記する
- 変更後は、私が次に何を学べばよいかを1〜3行で示す
