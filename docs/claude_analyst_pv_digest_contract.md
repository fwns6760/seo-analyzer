# Claude Analyst PV Digest Contract

`071` の Phase 1 は `seo-analyzer` 側の BigQuery mart を読み、Claude が朝の digest を組み立てるための read-only contract を固定する。

## Entry point

```bash
npm run analyst:digest -- --format json
```

fixture を使う dry-run:

```bash
npm run analyst:digest -- --fixture tests/fixtures/analyst-digest-ready.json --format human
```

## JSON contract

Claude analyst が読む入力はこの JSON のみとする。

- `window`
  - `reference_end_date`
  - `current_start_date`
  - `current_end_date`
  - `previous_start_date`
  - `previous_end_date`
  - `latest_date`
  - `active_days`
  - `target_days`
  - `remaining_days`
  - `eta_date`
  - `comparison_ready`
  - `status`
  - `status_reason`
- `kpis`
  - `clicks`
  - `impressions`
  - `sessions`
  - `total_users`
  - `key_events`
  - `matched_pages`
- `winners`
- `losers`
- `query_moves`
- `opportunities`
- `next_action_candidates`
- `revenue: null`
- `social_x: null`

## Claude output contract

Claude の出力は短い日本語メール本文のみ。5 ブロック固定。

1. `今日の要点`
2. `伸びたページ`
3. `落ちたページ`
4. `流入クエリ/改善候補`
5. `次の一手`

Rules:

- dashboard や SQL を直接見に行かず、この JSON だけを読む
- `revenue` が `null` なら `収益: 未接続` と明記する
- `social_x` が `null` なら `X寄与: 未接続` と明記する
- `next_action_candidates` は最大 1 件だけ採用する
- `window.comparison_ready = false` の時は `蓄積中` を返し、断定的な改善提案をしない
- user action は最大 1 件。無い時は `なし` と扱う

## Phase 1 boundaries

- 使うデータは `page_daily`, `query_daily`, `improvement_candidates_base` のみ
- X API は読まない
- AdSense / 収益 API は読まない
- `wordpressyoshilover` は触らない
- 自動送信はしない
