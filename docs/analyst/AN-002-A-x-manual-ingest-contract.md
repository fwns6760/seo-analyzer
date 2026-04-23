# AN-002-A X Manual Ingest Contract

- status: READY
- owner: Claude analyst
- parent: AN-002
- depends_on: none

## Purpose

AN-002 の最小 ingest route として、X の手動 CSV export を読む CLI と summary JSON の shape を固定する。`071` の digest JSON contract は壊さず、未投入時は analyst digest の `social_x: null` を維持する。

## Entry point

```bash
npm run x:ingest -- --csv <path> --format json
```

fixture dry-run:

```bash
npm run x:ingest -- --fixture tests/fixtures/x-manual-export-sample.csv --format human
```

flags:

- `--csv <path>` / `--fixture <path>`: 読み込む CSV (必須)
- `--format json|human`: 既定 `human`
- `--ingested-at <iso8601>`: `window.ingested_at` を上書き（テスト用）

## CSV column contract

### 必須列

欠けると CLI は exit 1 で `Missing required CSV column(s): ...` を出す。

| 列 | 型 | 備考 |
| --- | --- | --- |
| `post_id` | string | X の post id |
| `post_url` | string | X ポスト自体の URL (`https://x.com/.../status/...`) |
| `posted_at` | string | ISO 8601 推奨、`new Date()` が解釈できれば可 |
| `impressions` | integer | `1,200` のようなカンマ区切りも許容 |
| `engagements` | integer | 同上 |
| `link_clicks` | integer | 同上 |

### join 用列 (推奨)

どちらも任意、`canonical_url` を優先、`slug` を代替。両方無い行は `unmatched` に入る。

| 列 | 型 | 備考 |
| --- | --- | --- |
| `canonical_url` | string | `https://yoshilover.com/<slug>` を推奨 |
| `slug` | string | 先頭に `/` があっても無くても可 |

### 受け入れる header aliases

ヘッダーは case-insensitive、前後空白無視。以下を `post_id` などの canonical 名にマップする:

- `post_id`: `post_id` / `post id` / `postid` / `tweet_id` / `tweet id` / `id`
- `post_url`: `post_url` / `post url` / `permalink` / `tweet_url` / `tweet url` / `url`
- `posted_at`: `posted_at` / `posted at` / `date` / `time` / `post time` / `tweet time`
- `impressions`: `impressions` / `impression`
- `engagements`: `engagements` / `engagement`
- `link_clicks`: `link_clicks` / `link clicks` / `url_clicks` / `url clicks`
- `canonical_url`: `canonical_url` / `canonical url` / `canonical`
- `slug`: `slug`

## Output JSON shape

```json
{
  "window": {
    "posted_min": "YYYY-MM-DD",
    "posted_max": "YYYY-MM-DD",
    "post_count": 0,
    "ingested_at": "ISO-8601"
  },
  "top_posts": [{ "post_id": "...", "engagements": 0, "matched_page_path": "/..." }],
  "link_click_winners": [{ "post_id": "...", "link_clicks": 0, "matched_page_path": "/..." }],
  "post_to_page_matches": [
    {
      "matched_page_path": "/...",
      "canonical_url": "https://yoshilover.com/...",
      "post_count": 0,
      "impressions": 0,
      "engagements": 0,
      "link_clicks": 0
    }
  ],
  "coverage": {
    "total_posts": 0,
    "matched_posts": 0,
    "unmatched_posts": 0,
    "matched_rate": 0.0
  },
  "social_x_summary": {
    "total_impressions": 0,
    "total_engagements": 0,
    "total_link_clicks": 0,
    "avg_engagement_rate": 0.0,
    "top_post_id": "...",
    "top_link_click_post_id": "..."
  },
  "unmatched": [{ "post_id": "...", "matched_page_path": null }]
}
```

## Matching rule

- `canonical_url` があれば URL をパースして pathname を `matched_page_path` に採用
- なければ `slug` を `/<slug>` に整形して採用
- どちらも無い行は `matched_page_path = null` → `unmatched` に入る

## Acceptance

- fixture CSV で ingest 成功（`tests/fixtures/x-manual-export-sample.csv`）
- 必須列欠損で明示的エラー（`tests/fixtures/x-manual-export-missing.csv`）
- `top_posts` / `link_click_winners` / `post_to_page_matches` / `coverage` / `social_x_summary` / `unmatched` が JSON に含まれる
- `071` の `analyst:digest` 出力は一切変更しない（`social_x: null` 維持）
- `npm test` が通る

## Non-goals

- X API 直接連携
- 自動投稿
- BigQuery 書き込み（ingest は summary JSON 出力まで）
- analyst digest への統合（別 follow-up）
- `wordpressyoshilover` 側の実装
