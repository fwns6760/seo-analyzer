# Data Source Contract

## Goal
GSC と GA4 から何を、どの粒度で、どのキーで保存するかを MVP 向けに固定する。

## Source mapping
- GSC property: `https://yoshilover.com/`
- GA4 property: `properties/260608310`
- GA4 web stream: `http://yoshilover.com`

## Common rules
- 日次バッチで取得する
- 日付基準は JST
- raw は API の一次集計結果をそのまま保存し、カテゴリ集計は後段で作る
- ページ URL は後段で正規化し、集計では原則 path 単位を使う

## GSC contract

### Metrics
- `clicks`
- `impressions`
- `ctr`
- `position`

### Required grains
- `site_daily`
  - keys: `date`
  - use: ダッシュボードの全体推移
- `page_daily`
  - keys: `date`, `page`
  - use: 記事分析、順位下落、伸びた記事
- `query_daily`
  - keys: `date`, `query`
  - use: クエリ分析
- `page_query_daily`
  - keys: `date`, `page`, `query`
  - use: カニバリ候補、記事ごとの流入クエリ確認

### Raw column baseline
- `data_date`
- `site_url`
- `grain`
- `page`
- `query`
- `country`
- `device`
- `search_type`
- `clicks`
- `impressions`
- `ctr`
- `position`
- `fetched_at`

### Notes
- MVP では `country` `device` は nullable で確保し、初回取得は全体値を優先する
- `page_query_daily` は件数が最も増えるため、BigQuery raw へそのまま入れて後段で必要な view を作る

## GA4 contract

### Metrics
- `sessions`
- `total_users`
- `key_events`

### Metric policy
- `sessions` と `total_users` は MVP 必須
- `key_events` は GA4 側の主要イベント定義が未確定でも列は確保する
- 主要イベントが未設定の期間は `key_events` を `NULL` または `0` で扱う

### Required grains
- `site_daily`
  - keys: `date`
  - filter: `sessionDefaultChannelGroup = Organic Search`
  - use: ダッシュボードの自然検索推移
- `landing_page_daily`
  - keys: `date`, `landing_page`
  - filter: `sessionDefaultChannelGroup = Organic Search`
  - use: 記事別の自然検索流入、GSC page_daily との結合

### Raw column baseline
- `data_date`
- `property_id`
- `grain`
- `landing_page`
- `session_default_channel_group`
- `sessions`
- `total_users`
- `key_events`
- `fetched_at`

### Notes
- GA4 のページ系集計は `landing page` を使う。SEO では流入入口のページが重要だから
- `pagePath` ではなく `landing page` を使うことで、自然検索流入の入口ページを GSC の `page` と合わせやすくする

## Join strategy
- site 全体は `date` で結合
- 記事別は GSC `page_daily.page` と GA4 `landing_page_daily.landing_page` を URL 正規化後に結合
- クエリ別は GSC が主、GA4 は直接結合しない
- カテゴリ別は URL ルールで page を category へマッピングして後段集計する

## page_daily aggregate contract

### Primary key
- `data_date`
- `page_path`

### Normalization rules
- `https://yoshilover.com/...` のような absolute URL は host を落として path にする
- `landing_page` が path のまま返る場合も同じ `page_path` に寄せる
- query string と fragment は除外する
- 末尾 `/` は root を除き除去する
- 空 path は `/` として扱う

### Output columns
- `data_date`
- `page_path`
- `canonical_url`
- `site_url`
- `property_id`
- `web_stream_default_uri`
- `gsc_page_url`
- `ga4_landing_page`
- `clicks`
- `impressions`
- `ctr`
- `position`
- `sessions`
- `total_users`
- `key_events`
- `has_gsc_row`
- `has_ga4_row`
- `source_match_status`

### Join policy
- `raw_gsc.grain = page_daily` と `raw_ga4.grain = landing_page_daily` を使う
- join key は `data_date + normalized page_path`
- join は `FULL OUTER JOIN` とし、片側だけにあるページも落とさない
- UI や改善判定では `source_match_status` で欠損元を見分ける

## query_daily aggregate contract

### Primary key
- `data_date`
- `query`

### Source policy
- 基本ソースは `raw_gsc.grain = query_daily`
- `page_query_daily` は補助的に使い、クエリに紐づくページ数と代表ページを付与する
- `GA4` は query 粒度を持たないため join しない

### Output columns
- `data_date`
- `site_url`
- `query`
- `clicks`
- `impressions`
- `ctr`
- `position`
- `page_count`
- `top_page_url`
- `top_page_path`
- `top_page_canonical_url`
- `top_page_clicks`
- `top_page_impressions`
- `has_multiple_pages`

### Rollup rules
- `page_count` は同日の `page_query_daily` で見えた distinct `page` 数
- `top_page_*` は `clicks DESC, impressions DESC, page ASC` で 1 位のページ
- `has_multiple_pages = true` はクエリが同日に 2 ページ以上へ分散している状態
- これはカニバリ候補の一次判定に使えるが、最終判定は後段ロジックで行う

## category_daily aggregate contract

### Primary key
- `data_date`
- `category_slug`

### Source policy
- 基本ソースは `seo_mart.page_daily`
- `page_daily.page_path` を URL prefix ルールで category に割り当てる
- MVP では手動マスタを持たず、サイト構造から機械的に分類する

### Category mapping rules
- `page_path = /` は `category_slug = home`
- `^/category/<slug>/...` または `^/category/<slug>$` は `<slug>` を category とみなす
- 上記に当てはまらない path は `category_slug = uncategorized`
- `category_type` で `site_root / wordpress_category / uncategorized` を区別する

### Output columns
- `data_date`
- `category_slug`
- `category_type`
- `category_url`
- `page_count`
- `gsc_page_count`
- `ga4_page_count`
- `matched_page_count`
- `clicks`
- `impressions`
- `ctr`
- `position`
- `sessions`
- `total_users`
- `key_events`

### Rollup rules
- `clicks` `impressions` `sessions` `total_users` `key_events` は category 単位で合算
- `ctr` は `SUM(clicks) / SUM(impressions)`
- `position` は `impressions` 重み付き平均
- `matched_page_count` は GSC / GA4 の両方に存在した `page_path` 数
- `uncategorized` は URL 構造だけではカテゴリ判定できないページの退避先

## improvement_candidates_base contract

### Goal
- 改善候補ロジックの前段として、直近 7 日とその前 7 日の比較列を 1 view に集約する

### Source policy
- `page` signal は `seo_mart.page_daily`
- `query` signal は `seo_mart.query_daily`
- `category` signal は `seo_mart.category_daily`
- 基準日は `seo_mart.page_daily` の最新 `data_date`

### Output columns
- `reference_end_date`
- `entity_type`
- `entity_key`
- `entity_label`
- `supporting_key`
- `current_clicks`
- `previous_clicks`
- `clicks_delta`
- `current_impressions`
- `previous_impressions`
- `impressions_delta`
- `current_ctr`
- `previous_ctr`
- `ctr_delta`
- `current_position`
- `previous_position`
- `position_delta`
- `current_sessions`
- `previous_sessions`
- `sessions_delta`
- `current_total_users`
- `previous_total_users`
- `total_users_delta`
- `current_key_events`
- `previous_key_events`
- `key_events_delta`
- `current_support_count`
- `previous_support_count`
- `supports_rank_drop`
- `supports_growth`
- `supports_rewrite`
- `supports_cannibal`

### Period rules
- `current_7d` は `reference_end_date` を含む直近 7 日
- `previous_7d` はその直前 7 日
- `ctr` は window 内で再計算する
- `position` は window 内 `impressions` 重み付き平均で再計算する

### Interpretation rules
- `page` は順位下落、伸びた記事、リライト候補の前段に使う
- `query` はカニバリ候補の前段に使う
- `category` はカテゴリ単位の流入変化確認に使う
- 最終しきい値判定は `Epic 5` で別途定義する

### rank_drop_page_rule
- 対象は `entity_type = page`
- 前週の `impressions >= 50`
- `previous_position` と `current_position` が存在し、前週平均順位が `20` 位以内
- `position_delta >= 1.0` を必須にし、順位悪化がない需要減ページは除外する
- さらに次のどちらかを満たす
- `previous_clicks >= 5` かつ `clicks_delta <= -3` かつ `clicks` 下落率が `20%` 以上
- `previous_sessions >= 5` かつ `sessions_delta <= -3` かつ `sessions` 下落率が `20%` 以上
- 並び順は `position_delta DESC -> clicks損失率 DESC -> sessions損失率 DESC -> previous_clicks DESC`

### growth_page_rule
- 対象は `entity_type = page`
- 今週の `impressions >= 50`
- `current_position` が存在し、今週平均順位が `20` 位以内
- さらに次のどちらかを満たす
- `previous_clicks >= 5` かつ `clicks_delta >= 3` かつ `clicks` 増加率が `20%` 以上
- `previous_sessions >= 5` かつ `sessions_delta >= 3` かつ `sessions` 増加率が `20%` 以上
- かつ次のどちらかを満たす
- `previous_position` があり `position_delta <= -0.5`
- `impressions_delta >= 30`
- 並び順は `clicks増加率 DESC -> sessions増加率 DESC -> clicks_delta DESC -> current_position ASC`

### rewrite_page_rule
- 対象は `entity_type = page`
- 今週の `impressions >= 80`
- `current_position` が `6-20` 位
- `current_ctr` が存在し `12%` 未満
- 並び順は `current_impressions DESC -> current_position ASC -> current_ctr ASC -> current_clicks DESC`

### cannibal_query_rule
- 対象は `entity_type = query`
- 今週の `current_support_count >= 2`
- 今週の `impressions >= 80`
- `current_position` が存在し `20` 位以内
- 並び順は `current_support_count DESC -> current_impressions DESC -> current_clicks DESC -> current_position ASC`

### mvp_opportunity_threshold_policy
- `rank_drop` と `growth` はどちらも `20` 位以内の page を主戦場として扱い、守る候補と伸ばす候補を同じ検索面で比較できるようにする
- `rank_drop` は前週母数を重視し、`growth` は今週母数を重視する
- `rewrite` は `6-20` 位の中位ページに限定し、すでに上位定着した page や圏外 page と切り分ける
- `cannibal` は `query` 単位で `support_count` と露出量を使い、page 系ルールとは別軸で判定する
- `growth` と `rewrite` の重なりは許容し、伸びているが取り切れていない page を両面から見られるようにする

## MVP decision
- 先に固定する raw は `raw_gsc` と `raw_ga4`
- GSC は 4 grain、GA4 は 2 grain を保存する
- `CV/主要イベント` は raw 列を先に確保し、GA4 側定義が固まり次第 `key_events` の本番運用を開始する
- `page_daily` は `seo_mart.page_daily` view で提供し、GSC と GA4 の page 系指標を 1 つの参照面にまとめる
- `query_daily` は `seo_mart.query_daily` view で提供し、GSC の query 指標に page 分散情報を重ねる
- `category_daily` は `seo_mart.category_daily` view で提供し、URL prefix ベースのカテゴリ集計を先に用意する
- 改善候補の前段比較は `seo_mart.improvement_candidates_base` view で提供し、`Epic 5` はこの view を基礎に判定する
