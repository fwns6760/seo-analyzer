# AN-002 X Manual Ingest

- status: IN_PROGRESS
- owner: Claude analyst
- depends_on: AN-001 optional
- sub_tickets:
  - AN-002-A (ingest CLI + summary JSON + fixture tests) — READY、`docs/analyst/AN-002-A-x-manual-ingest-contract.md` に contract を固定

## Why now

Phase 1 の analyst digest は `social_x: null` のままで、X 側の寄与を読めない。API から始めると課金と運用境界が重くなるため、まずは手動 export / CSV ingest から入る。

## Purpose

X の投稿パフォーマンスを analyst 側に取り込める最小 ingestion ルートを作り、PV digest と並べて読める材料を用意する。

## Scope

- 手動 export / CSV の ingest contract を固定する
- post id / URL / 投稿日 / impressions / engagements / link clicks などの最小列を決める
- page / article 粒度へ join する前提列を定義する
- fixture で ingest shape を固定する

## Success criteria

- analyst が `social_x: null` ではなく、最低限の summary を読める
- API 依存なしで ingest できる
- 将来の API 連携へ移行しやすい列設計になっている

## Non-goals

- X API 直接連携
- 自動投稿
- リアルタイム収集
- `wordpressyoshilover` 側の投稿実装

## Acceptance check

- CSV contract が markdown で明文化されている（AN-002-A で完了）
- fixture ingest test がある（AN-002-A で完了）
- 未投入時は `X寄与: 未接続` を維持できる（`071` digest 側を改変していないため担保）

## Follow-up

- AN-002-A で ingest summary JSON までは完成。次段として「summary JSON を analyst digest の `social_x` に合流させる」拡張は `071` contract の shape 変更を伴うため別 ticket で扱う。
- BigQuery への投入ルートは `social_x.account_overview_daily` のみ先行で存在（アカウント集計のみ、post 単位は未投入）。
