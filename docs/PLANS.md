# PLANS.md

## How to use
大きな機能追加、認証実装、GCP構成変更、DB設計変更、集計ロジック変更の前に、このファイルへ計画を書く。

## Plan template

### 1. Goal
何を実現するか

### 2. Why
なぜ必要か

### 3. Scope
今回やる範囲
やらないことも書く

### 4. Files to change
変更対象ファイル

### 5. Implementation steps
1. 調査
2. 設計
3. 実装
4. テスト
5. 仕上げ

### 6. Risks
壊れやすい点、認証、環境変数、GCP権限など

### 7. Validation
何が通れば完了か
- lint
- typecheck
- ログイン確認
- データ取得確認

### 8. Progress log
進捗を時系列で残す

## GCP learning notes
- 今回触った GCP サービス: Google Cloud CLI, IAM, Cloud Run, Artifact Registry, Secret Manager, Cloud Logging, Cloud Monitoring, Cloud Scheduler, BigQuery, Cloud Build
- 役割: GCP プロジェクト `baseballsite` を CLI から操作可能にし、GSC / GA4 の最小取得結果を BigQuery raw テーブル設計へ落とし込む
- なぜ使ったか: 画面操作だけでなく `gcloud` で再現できる状態を作ると、以後の IAM 設計と Cloud Run デプロイが進めやすい
- 次に覚えること: page_daily / query_daily 集計 view の作り方、URL 正規化ルール、Cloud Run Jobs で複数 grain をどう回すか

---

## Execution log

### 2026-03-08 E2-T7 失敗時ログ確認

### 1. Goal
`Cloud Run Jobs` の失敗時にどこを見れば原因を特定できるかを確認し、必要なら修正まで完了する。

### 2. Why
定期ジョブは一度成功しても認証や権限で落ちやすいため、`Cloud Logging` と execution detail の見方を実体験しておく必要があるため。

### 3. Scope
- `DRY_RUN=false` で job を実行
- failed execution の detail と `Cloud Logging` を確認
- 認証方式の不整合を修正
- successful execution まで再実行

今回はやらないこと:
- 失敗通知の自動化
- retry 戦略の最適化
- UI 側の raw 表示

### 4. Files to change
- `scripts/lib/google-auth.mjs`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `DRY_RUN=false` で `seo-fetch-job` を実行する
2. `gcloud run jobs executions describe` と `gcloud logging read` で失敗原因を確認する
3. 認証方式を `metadata server` 依存から `Secret Manager` 上の OAuth refresh token 利用へ切り替える
4. job を更新して再実行する
5. 成功時の insert 件数を確認する

### 6. Risks
- `Search Console API` や `GA4` のような user-consent 系 API は service account access token だけでは足りない場合がある
- refresh token を使うので、Secret Manager の権限管理が重要
- OAuth client の取り消しや再同意で token 更新が必要になる

### 7. Validation
- failed execution の原因が `Cloud Logging` で読める
- `Secret Manager` に OAuth secrets が保存されている
- `seo-fetch-job` が secret env を読む構成で成功する
- Cloud 実行で GSC / GA4 の raw insert 件数が出る

### 8. Progress log
- `DRY_RUN=false` の初回実行は `ACCESS_TOKEN_SCOPE_INSUFFICIENT` で失敗した
- `Cloud Logging` から `Search Console API` の scope 不足を確認した
- local ADC 由来の `client_id/client_secret/refresh_token` を `Secret Manager` に保存した
- `seo-batch-runtime` に各 secret の `roles/secretmanager.secretAccessor` を付与した
- `google-auth` helper を refresh token exchange 優先へ変更した
- `seo-fetch-job-8rhxd` が成功し、cloud 実行で GSC `1225` 行、GA4 `172` 行の insert を確認した

### 9. 学習メモ
- 何をするか: batch の失敗原因を `Cloud Logging` で特定し、認証方式を修正する
- なぜその GCP サービスを使うか: `Cloud Logging` は job の stderr と system log を一緒に追えるので、失敗時の切り分けが最も速い
- 代替案は何か: Console 画面だけで追う、再実行だけを繰り返す
- 今回はなぜその案を選ぶか: 失敗理由を文字列で確定しないと、権限不足なのかコード不具合なのか切り分けできないため
- 実行コマンドの意味: `gcloud run jobs executions describe` は execution 状態確認、`gcloud logging read` は stderr / system log 読み出し、`gcloud secrets ...` は OAuth secrets を安全に保持、`gcloud run jobs update --set-secrets` は job へ secret env を注入する
- 次に確認するポイント: ここで GCP 学習の取得系は一通り通ったので、次は `Supabase Auth + Google OAuth` の本体実装へ戻る

### 2026-03-08 E2-T6 BigQuery に raw テーブル保存

### 1. Goal
GSC / GA4 の取得結果を `BigQuery` raw テーブルへ保存できるようにし、1 回分の実データ insert を確認する。

### 2. Why
接続確認とジョブ起動だけでは MVP の価値にならず、`BigQuery` に raw が貯まり始めて初めて集計 view と画面実装に進めるため。

### 3. Scope
- batch script に raw 保存ロジックを追加
- GSC 4 grain / GA4 2 grain の取得を batch 内に実装
- `BigQuery insertAll` helper を追加
- raw DDL を実際に `BigQuery` に適用
- 1 日分の insert を確認

今回はやらないこと:
- `Cloud Run Jobs` からの実データ本番取得
- `DRY_RUN=false` の cloud 側切替
- 失敗時ログの確認

### 4. Files to change
- `scripts/seo-batch-job.mjs`
- `scripts/lib/bigquery-client.mjs`
- `scripts/lib/gsc-client.mjs`
- `scripts/lib/ga4-client.mjs`
- `scripts/lib/google-auth.mjs`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. GSC と GA4 の multi-grain 取得関数を batch に組み込む
2. raw schema に合わせて row を整形する
3. `BigQuery insertAll` helper を追加する
4. `raw_gsc.sql` `raw_ga4.sql` を `BigQuery` に適用する
5. 1 日分の batch をローカル user 認証で実行し、保存件数を確認する
6. job 用 Service Account に `BigQuery` 書き込み権限を付ける

### 6. Risks
- `GA4` の `date` は `YYYYMMDD` で返るため、`BigQuery DATE` へ正規化が必要
- raw は `batch_id` つき append 運用なので、再実行時は重複ではなく別 batch として入る
- `Cloud Run Jobs` 本番実行には `Search Console` と `GA4` で service account 側の閲覧権限が必要

### 7. Validation
- `seo_raw.raw_gsc` と `seo_raw.raw_ga4` が作成されている
- batch script が `insertAll` で raw 保存できる
- `2026-03-04` の 1 日分で GSC と GA4 の row count が確認できる
- `seo-fetch-job` が最新イメージへ更新されている

### 8. Progress log
- `BigQuery insertAll` helper を追加した
- GSC は `site/page/query/page_query`、GA4 は `site/landing_page` の各 grain を取得するようにした
- `GA4` の日付を `YYYYMMDD -> YYYY-MM-DD` へ正規化する修正を入れた
- `raw_gsc.sql` と `raw_ga4.sql` を `BigQuery` に適用した
- `2026-03-04` の 1 日分で GSC `1/116/227/227` 行、GA4 `1/85` 行の insert を確認した
- `seo-batch-runtime` に `roles/bigquery.dataEditor` を付与し、`seo-fetch-job` を最新イメージへ更新した

### 9. 学習メモ
- 何をするか: API の取得結果を `BigQuery` raw テーブルへ append 保存する
- なぜその GCP サービスを使うか: `BigQuery` は後段集計と比較分析の保存先で、raw を先に積むと view と UI の土台になる
- 代替案は何か: JSON ファイルへ保存する、または別 DB を使う
- 今回はなぜその案を選ぶか: 要件で `BigQuery` を使う前提で、`GSC/GA4` の列構造とも相性がよいため
- 実行コマンドの意味: `bq query` は DDL 適用、`node scripts/seo-batch-job.mjs --target=all --start-date=... --end-date=...` は 1 日分の取得と raw 保存確認、`gcloud projects add-iam-policy-binding` は batch 実行 identity に `BigQuery` 書き込み権限を付ける
- 次に確認するポイント: `seo-batch-runtime` を `Search Console` と `GA4` に追加して `DRY_RUN=false` に切り替えたとき、Cloud Run Jobs / Cloud Scheduler / Cloud Logging のどこで失敗を追うか

### 2026-03-08 E2-T5 Cloud Scheduler で日次実行

### 1. Goal
`Cloud Scheduler` から `Cloud Run Jobs` の SEO batch を日次起動できる状態にする。

### 2. Why
定期取得を本番運用へ近づけるには、手動実行だけでなくスケジュール起動経路を先に通しておく必要があるため。

### 3. Scope
- job 用コンテナを `Cloud Build` で build / push
- `Cloud Run Jobs` を作成
- scheduler 専用 Service Account を作成
- `Cloud Scheduler` から job 実行 API を日次で呼ぶ設定を作成
- 即時実行で起動経路を確認

今回はやらないこと:
- `BigQuery` insert 実装
- 実データ取得の本番有効化
- `Cloud Scheduler` 失敗通知

### 4. Files to change
- `scripts/lib/google-auth.mjs`
- `scripts/seo-batch-job.mjs`
- `cloudbuild.job.yaml`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `Cloud Run Jobs` コンテナ内で token を取れるよう `metadata server` 対応を入れる
2. `Cloud Build` で job イメージを build / push する
3. `seo-fetch-job` を `DRY_RUN=true` で作成する
4. `seo-scheduler-invoker` Service Account を作成し `roles/run.invoker` を付与する
5. `Cloud Scheduler` で `run.googleapis.com/v2/.../jobs/...:run` を日次 POST する
6. 即時実行して execution と scheduler log を確認する

### 6. Risks
- 実データ取得に切り替えるには `seo-batch-runtime` を `Search Console` と `GA4` に追加する必要がある
- `Cloud Scheduler` は 200 を返しても job 本体の失敗は別ログで見る必要がある
- `DRY_RUN=true` のままでは定期実行されても raw 保存は進まない

### 7. Validation
- `Cloud Build` で job イメージが `Artifact Registry` に push されている
- `seo-fetch-job` が `Cloud Run Jobs` に存在する
- `seo-fetch-daily` が `Cloud Scheduler` に存在し `ENABLED`
- `Cloud Scheduler` の実行ログが HTTP 200 を返す
- `Cloud Run Jobs` execution が増える

### 8. Progress log
- `google-auth` helper を `metadata server` 優先に変更し、job コンテナ内でも token を取得できるようにした
- `cloudbuild.job.yaml` を追加し、`Dockerfile.job` ベースでイメージを build / push した
- `seo-fetch-job` を `seo-batch-runtime` で作成し、環境変数は `DRY_RUN=true` にした
- `seo-scheduler-invoker` を作成し、`seo-fetch-job` に `roles/run.invoker` を付与した
- `seo-fetch-daily` を `Asia/Tokyo` 毎日 05:15 で作成した
- `Cloud Scheduler` ログで HTTP 200、`Cloud Run Jobs` execution 増加を確認した

### 9. 学習メモ
- 何をするか: `Cloud Scheduler` から `Cloud Run Jobs` を毎日起動する
- なぜその GCP サービスを使うか: `Cloud Scheduler` は cron 役、`Cloud Run Jobs` は一回実行 batch 役で責務が分かれている
- 代替案は何か: `Cloud Run` サービスへ cron endpoint を叩く、`Cloud Functions` を使う
- 今回はなぜその案を選ぶか: 要件の構成に合い、Web と batch を分離した方が運用と学習の両方で分かりやすいため
- 実行コマンドの意味: `gcloud builds submit` は job イメージの build / push、`gcloud run jobs create` は batch 実行定義の作成、`gcloud scheduler jobs create http` は `run.googleapis.com` の job 実行 API を cron で呼ぶ設定
- 次に確認するポイント: `BigQuery` insert を入れる前に `seo-batch-runtime` を `Search Console` と `GA4` に追加し、`DRY_RUN=false` に切り替えられるか

### 2026-03-08 E2-T4 Cloud Run Jobs ひな形作成

### 1. Goal
`Cloud Run Jobs` で GSC / GA4 の取得バッチを動かすための最小 entrypoint と job 用コンテナ定義を作る。

### 2. Why
次の `BigQuery` 保存や `Cloud Scheduler` 定期実行に進む前に、HTTP サービスとは別に batch 実行専用の入口を分けておかないと、デプロイとログ確認が複雑になるため。

### 3. Scope
- batch 用の Node.js entrypoint を追加
- GSC / GA4 共通 helper を切り出す
- `Cloud Run Jobs` 用 `Dockerfile` を追加
- `dry-run` で動作確認できる npm script を追加

今回はやらないこと:
- `BigQuery` insert 実装
- `Cloud Scheduler` 実行
- `Cloud Run Jobs` の実デプロイ

### 4. Files to change
- `scripts/seo-batch-job.mjs`
- `scripts/lib/google-auth.mjs`
- `scripts/lib/date-range.mjs`
- `scripts/lib/gsc-client.mjs`
- `scripts/lib/ga4-client.mjs`
- `scripts/gsc-connection-check.mjs`
- `scripts/ga4-connection-check.mjs`
- `Dockerfile.job`
- `package.json`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. 既存の GSC / GA4 接続確認コードから共通処理を切り出す
2. `BATCH_TARGET`, `START_DATE`, `END_DATE`, `DRY_RUN` を解釈する batch entrypoint を作る
3. `Cloud Run Jobs` 用の `Dockerfile.job` を追加する
4. `npm run batch:job:dry-run` でローカル確認する
5. 進捗ファイルを更新する

### 6. Risks
- `Cloud Run Jobs` 本番では service account 側に API 呼び出し権限が必要
- `START_DATE` / `END_DATE` の解釈を後で変えると再取得ルールに影響する
- まだ `BigQuery` 保存は入っていないため、実運用ジョブとしては未完成

### 7. Validation
- `scripts/seo-batch-job.mjs` が存在し `--dry-run` で動く
- `Dockerfile.job` が job 用 entrypoint を実行する
- GSC / GA4 接続確認スクリプトが共通 helper を参照しても syntax error にならない
- `package.json` に job 用 script がある

### 8. Progress log
- 共通処理を `scripts/lib` へ切り出した
- `seo-batch-job.mjs` で `all/gsc/ga4` target と date range 解釈を実装
- `Dockerfile.job` を追加して HTTP サービス用イメージと分離した
- `npm run batch:job:dry-run` で設定解釈のみ確認した

### 9. 学習メモ
- 何をするか: `Cloud Run Jobs` で動く batch 専用の入口を用意する
- なぜその GCP サービスを使うか: `Cloud Run Jobs` は HTTP を待ち受けない一回実行バッチに向いていて、GSC / GA4 の定期取得に合う
- 代替案は何か: `Cloud Run` サービスに cron 風 endpoint を作る、`Cloud Functions` を使う
- 今回はなぜその案を選ぶか: 要件どおり `Cloud Run Jobs + Cloud Scheduler` に寄せると、本番運用構成と学習内容が一致するため
- 実行コマンドの意味: `npm run batch:job:dry-run` は API を叩かずに job の target と日付解釈だけ確認する。`Dockerfile.job` はその entrypoint をコンテナ化する
- 次に確認するポイント: `Cloud Scheduler` からどの引数で job を起動するか、job 実行 identity に何権限が必要か

### 2026-03-08 E3-T6 改善候補用ビュー作成

### 1. Goal
改善候補ロジックの前段になる BigQuery view を作り、ページ・クエリ・カテゴリの比較列を共通形式で参照できる状態にする。

### 2. Why
`Epic 5` では複数の判定ルールを作るが、毎回 period 比較 SQL を個別に書くと重複が多くなるため、まずは 7 日比較のベース view を固定したい。

### 3. Scope
- 改善候補の前段 view 名を決定
- 直近 7 日と前 7 日の比較列を決定
- `page/query/category` を共通スキーマで返す構成を決定
- BigQuery view DDL を追加

今回はやらないこと:
- しきい値の最終決定
- 順位下落やリライト候補の確定判定
- BigQuery 実適用

### 4. Files to change
- `sql/bigquery/improvement_candidates_base.sql`
- `docs/data_source_contract.md`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `page_daily` `query_daily` `category_daily` のうち改善候補に必要な比較列を決める
2. `current_7d` と `previous_7d` の window 定義を決める
3. entity ごとに比較値を集計し、共通列へそろえる
4. `seo_mart.improvement_candidates_base` view DDL を追加する
5. 契約ファイルと進捗ファイルを更新する

### 6. Risks
- 最新日が source 間でずれると period 比較の基準が揃わない
- `page` と `category` は sessions を持つが `query` は持たないため、NULL 列の意味を UI 側で理解する必要がある
- `current_support_count` は entity によって意味が異なるため、最終判定では entity_type ごとの解釈が必要

### 7. Validation
- `sql/bigquery/improvement_candidates_base.sql` に view DDL がある
- `docs/data_source_contract.md` に output columns と period rules がある
- `page/query/category` が同一スキーマで返る
- `supports_*` 列でどの判定に使えるかが分かる

### 8. Progress log
- 改善候補の前段 view 名を `improvement_candidates_base` と決定
- 比較 window は `reference_end_date` 基準の `current_7d` / `previous_7d` に固定
- `page` は順位下落 / 伸びた記事 / リライト候補向け、`query` はカニバリ候補向け、`category` は補助比較向けに整理
- `supports_rank_drop` `supports_growth` `supports_rewrite` `supports_cannibal` を追加
- `sql/bigquery/improvement_candidates_base.sql` に view DDL を追加

### 9. 学習メモ
- 何をするか: 改善候補を判定する前の比較データを `BigQuery` view にまとめる
- なぜその GCP サービスを使うか: `BigQuery` view に window 比較を置くと、後続の判定 SQL や UI が同じ基準を共有できる
- 代替案は何か: 各候補ロジックごとに別々の SQL を持つ
- 今回はなぜその案を選ぶか: MVP では rule 実装前に比較列を共通化した方が、しきい値調整と UI 実装の両方が楽になるため
- 実行コマンドの意味: 今回は `sql/bigquery/improvement_candidates_base.sql` に `CREATE OR REPLACE VIEW` を記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: `Cloud Run Jobs` から raw テーブルへ insert する最小フローをどう作るか、ジョブ引数に期間をどう渡すか

### 2026-03-08 E3-T5 category_daily 集計設計

### 1. Goal
`category_daily` の BigQuery 集計 view 定義を確定し、カテゴリ別の推移と比較を 1 つの参照面で扱える状態にする。

### 2. Why
MVP ではカテゴリ別比較が必要だが、手動マスタを先に整備すると着手が遅くなるため、まずは URL 構造から自動でカテゴリを切る view を固定する。

### 3. Scope
- `category_daily` の dataset / view 名を決定
- URL prefix ベースのカテゴリ判定ルールを決定
- category 単位の集計列を決定
- BigQuery view DDL を追加

今回はやらないこと:
- 手動カテゴリマスタの作成
- 改善候補ロジック
- BigQuery 実適用

### 4. Files to change
- `sql/bigquery/category_daily.sql`
- `docs/data_source_contract.md`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `yoshilover.com` の URL 構造を確認する
2. `page_daily` から category を切り出す prefix ルールを決める
3. category 単位の集計式を決める
4. `seo_mart.category_daily` view DDL を追加する
5. 契約ファイルと進捗ファイルを更新する

### 6. Risks
- サイト構造変更で `/category/<slug>/...` 以外のカテゴリ表現が増えると `uncategorized` が増える
- 日本語 slug はエンコード文字列のまま扱うため、表示名整形は後段で必要になる場合がある
- `position` は重み付き平均で再計算しないと誤差が出る

### 7. Validation
- `sql/bigquery/category_daily.sql` に `seo_mart.category_daily` view DDL がある
- `docs/data_source_contract.md` に category 用の mapping ルールと出力列がある
- category 集計に `ctr` と `position` の再計算式がある
- `uncategorized` の扱いが明記されている

### 8. Progress log
- `yoshilover.com` は `/category/<slug>/...` 構造を持つことを確認
- `page_path = /` は `home`、`/category/<slug>/...` は `<slug>`、それ以外は `uncategorized` とする方針にした
- `category_daily` は `seo_mart.page_daily` を元に集計する形に決定
- `ctr` は再計算、`position` は `impressions` 重み付き平均に固定
- `sql/bigquery/category_daily.sql` に view DDL を追加

### 9. 学習メモ
- 何をするか: ページ別 view をカテゴリ別にまとめる `BigQuery` view を作る
- なぜその GCP サービスを使うか: `BigQuery` view にカテゴリ切り出しルールを置くと、UI と改善ロジックが同じ分類基準を共有できる
- 代替案は何か: 手動カテゴリマスタを先に作る、またはアプリ側で分類する
- 今回はなぜその案を選ぶか: MVP ではサイト構造から自動推定する方が早く、後でマスタ方式に差し替えやすいため
- 実行コマンドの意味: 今回は `sql/bigquery/category_daily.sql` に `CREATE OR REPLACE VIEW` を記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: 改善候補用 view は `page_daily` / `query_daily` / `category_daily` のどれを基礎にし、どのしきい値列を先に持たせるか

### 2026-03-08 E3-T4 query_daily 集計設計

### 1. Goal
`query_daily` の BigQuery 集計 view 定義を確定し、クエリ分析画面とカニバリ候補判定の前段データを 1 つの参照面で扱える状態にする。

### 2. Why
クエリ分析は GSC の `query_daily` だけでも作れるが、同日に何ページへ分散しているかを毎回別 SQL で見に行くと複雑になるため、代表ページ情報まで含めた view を先に固定する。

### 3. Scope
- `query_daily` の dataset / view 名を決定
- `query_daily` に残す列を決定
- `page_query_daily` から page 分散情報をどう補うかを決定
- BigQuery view DDL を追加

今回はやらないこと:
- カニバリ候補の最終判定ロジック
- category 集計
- BigQuery 実適用

### 4. Files to change
- `sql/bigquery/query_daily.sql`
- `docs/data_source_contract.md`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `query_daily` を GSC 単独で持つか、補助列を足すかを決める
2. `page_query_daily` から `page_count` と代表ページを求める集約ルールを決める
3. `seo_mart.query_daily` view DDL を追加する
4. 契約ファイルと進捗ファイルを更新する

### 6. Risks
- GSC `query_daily` と `page_query_daily` は集計仕様差で完全一致しない場合がある
- 代表ページを 1 つに決めるルールは click 優先のため、僅差ケースでは見え方がぶれる
- `has_multiple_pages` は一次判定であり、カニバリ確定とは限らない

### 7. Validation
- `sql/bigquery/query_daily.sql` に `seo_mart.query_daily` view DDL がある
- `docs/data_source_contract.md` に query 用の出力列と rollup ルールがある
- view に `page_count` と代表ページ列が含まれている
- `GA4` を join しない理由が明確になっている

### 8. Progress log
- `query_daily` は `GSC` 主体の view と決定
- `page_query_daily` から `page_count` と代表ページを補助列として付与する方針にした
- 代表ページは `clicks DESC, impressions DESC, page ASC` で 1 位を選ぶルールに固定
- `has_multiple_pages` を追加し、クエリ分散の一次判定に使えるようにした
- `sql/bigquery/query_daily.sql` に view DDL を追加

### 9. 学習メモ
- 何をするか: クエリ別の GSC 指標を `BigQuery` view にまとめ、ページ分散情報も一緒に見られるようにする
- なぜその GCP サービスを使うか: `BigQuery` view にしておくと、クエリ分析画面と改善候補ロジックで同じ集計定義を再利用できる
- 代替案は何か: `query_daily` は単純 view にして、ページ数や代表ページは別 SQL で都度計算する
- 今回はなぜその案を選ぶか: MVP ではクエリ分析とカニバリ候補の入口を早く固めたく、補助列まで含めた方が後続実装が単純になるため
- 実行コマンドの意味: 今回は `sql/bigquery/query_daily.sql` に `CREATE OR REPLACE VIEW` を記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: `category_daily` を URL prefix ルールでどう作るか、カテゴリマッピングをどこに持つか

### 2026-03-08 E3-T3 page_daily 集計設計

### 1. Goal
`page_daily` の BigQuery 集計 view 定義を確定し、記事別画面と改善判定が 1 つの参照面を使える状態にする。

### 2. Why
MVP の記事分析は GSC の `page_daily` と GA4 の `landing_page_daily` を毎回個別に join するより、正規化ルール込みの view を先に固定した方が実装と検証が単純になるため。

### 3. Scope
- `page_daily` の dataset / view 名を決定
- GSC と GA4 の URL 正規化ルールを決定
- join 方式と欠損時の扱いを決定
- BigQuery view DDL を追加

今回はやらないこと:
- `query_daily` view
- category 集計
- BigQuery 実適用

### 4. Files to change
- `sql/bigquery/page_daily.sql`
- `docs/data_source_contract.md`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `docs/data_source_contract.md` の join 方針を見直す
2. GSC `page` と GA4 `landing_page` の共通 join key を `page_path` として定義する
3. query string / fragment / host を除去する正規化ルールを固定する
4. `FULL OUTER JOIN` で片側だけのページも残す view を設計する
5. `sql/bigquery/page_daily.sql` と進捗ファイルを更新する

### 6. Risks
- GA4 `landing_page` が path か absolute URL かで揺れる可能性がある
- 末尾 `/` の扱いを誤ると同一ページが分裂する
- `FULL OUTER JOIN` なので UI 側は `source_match_status` を見て欠損を解釈する必要がある

### 7. Validation
- `sql/bigquery/page_daily.sql` に `seo_mart.page_daily` view DDL がある
- join key と正規化ルールが `docs/data_source_contract.md` に明記されている
- 出力列に GSC / GA4 両方のページ指標が含まれている
- 欠損判定用の列がある

### 8. Progress log
- 集計 dataset 名を `seo_mart` と決定
- join key を `data_date + page_path` と定義
- URL 正規化は host / query string / fragment を落とし、root 以外の末尾 `/` を除去するルールに固定
- 片側だけのページも残すため `FULL OUTER JOIN` を採用
- `source_match_status` `has_gsc_row` `has_ga4_row` を追加
- `sql/bigquery/page_daily.sql` に view DDL を追加

### 9. 学習メモ
- 何をするか: GSC と GA4 のページ別データを 1 つの `BigQuery` view にまとめる
- なぜその GCP サービスを使うか: `BigQuery` view に join と正規化ルールを閉じ込めると、後の `Cloud Run` アプリや判定ロジックが同じ結果を再利用しやすい
- 代替案は何か: 画面やバッチごとに都度 SQL を書いて join する、または materialized table にする
- 今回はなぜその案を選ぶか: MVP ではまず計算ルールを固定することが重要で、view なら定義変更もしやすいため
- 実行コマンドの意味: 今回は `sql/bigquery/page_daily.sql` として `CREATE OR REPLACE VIEW` を先に記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: `query_daily` は GSC 単独で十分か、改善候補ロジックに必要な列をどこまで view に含めるか

### 2026-03-08 E3-T2 raw_ga4 テーブル設計

### 1. Goal
`raw_ga4` の BigQuery テーブル定義を確定し、後続の取得ジョブが GA4 の multi-grain データを insert できる状態にする。

### 2. Why
GA4 側も `site_daily` と `landing_page_daily` を 1 table で持つ設計にしたため、NULL 列、partition、clustering を先に固定する必要があるため。

### 3. Scope
- `raw_ga4` の dataset と table 名を決定
- 列型と nullable 方針を決定
- partition / clustering 方針を決定
- BigQuery DDL を追加

今回はやらないこと:
- BigQuery 実作成
- `page_daily` 集計 view
- 取得ジョブの insert 実装

### 4. Files to change
- `sql/bigquery/raw_ga4.sql`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `docs/data_source_contract.md` の GA4 契約を見直す
2. `raw_ga4` を 1 table / multi-grain で表現する列を決める
3. `data_date` partition と `property_id, grain, landing_page` clustering を決める
4. `sql/bigquery/raw_ga4.sql` に `CREATE SCHEMA` と `CREATE TABLE` を追加
5. 進捗ファイルを更新

### 6. Risks
- `landing_page_daily` は URL / path の揺れがあるため、後段正規化が必要
- `key_events` は property 側の定義未確定だと期間比較で扱いにくい
- `site_daily` と `landing_page_daily` を同 table に入れるため、grain 条件なし集計は誤りやすい

### 7. Validation
- `sql/bigquery/raw_ga4.sql` に `seo_raw.raw_ga4` DDL がある
- `data_date` partition が定義されている
- `property_id, grain, landing_page` clustering が定義されている
- GA4 契約の列が過不足なく表現されている

### 8. Progress log
- table 名を `raw_ga4` と決定
- property 対応追跡用に `web_stream_default_uri` を追加
- `landing_page` は `site_daily` では NULL とした
- `session_default_channel_group` は MVP では `Organic Search` 前提だが列として保持
- `key_events` は nullable の `FLOAT64` として確保
- `sql/bigquery/raw_ga4.sql` に DDL を追加

### 9. 学習メモ
- 何をするか: GA4 の raw 集計結果を BigQuery へそのまま保存するテーブルを定義する
- なぜその GCP サービスを使うか: `BigQuery` は後の集計 view と比較分析の基盤で、partition / clustering を先に決めるとクエリの形も整理しやすい
- 代替案は何か: `site_daily` と `landing_page_daily` を別 table に分ける
- 今回はなぜその案を選ぶか: source ごとに 1 raw table に揃えると取得ジョブと運用ルールを単純化できるため
- 実行コマンドの意味: 今回は `sql/bigquery/raw_ga4.sql` として DDL を先に記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: `page_daily` で GSC と GA4 をどう正規化結合するか、どの列を集計 view に残すか

### 2026-03-08 E3-T1 raw_gsc テーブル設計

### 1. Goal
`raw_gsc` の BigQuery テーブル定義を確定し、後続の取得ジョブが迷わず insert できる状態にする。

### 2. Why
GSC 側は 4 grain を 1 つの raw テーブルで持つ設計にしたため、列の nullable 方針、partition、clustering を先に固定する必要があるため。

### 3. Scope
- `raw_gsc` の dataset と table 名を決定
- 列型と nullable 方針を決定
- partition / clustering 方針を決定
- BigQuery DDL を追加

今回はやらないこと:
- `raw_ga4` の DDL
- BigQuery 実作成
- 取得ジョブの insert 実装

### 4. Files to change
- `sql/bigquery/raw_gsc.sql`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `docs/data_source_contract.md` の GSC 契約を見直す
2. `raw_gsc` を 1 table / multi-grain で表現する列を決める
3. `data_date` partition と `site_url, grain, page, query` clustering を決める
4. `sql/bigquery/raw_gsc.sql` に `CREATE SCHEMA` と `CREATE TABLE` を追加
5. 進捗ファイルを更新

### 6. Risks
- `page_query_daily` が最も大きくなるため、clustering を誤るとスキャン量が増える
- `page` と `query` が grain によって NULL になるため、下流クエリで grain 条件が必須
- `ctr` と `position` は平均系なので、後段集計で単純平均しない注意が必要

### 7. Validation
- `sql/bigquery/raw_gsc.sql` に `seo_raw.raw_gsc` DDL がある
- `data_date` partition が定義されている
- `site_url, grain, page, query` clustering が定義されている
- GSC 契約の列が過不足なく表現されている

### 8. Progress log
- dataset 名を `seo_raw` と決定
- table 名を `raw_gsc` と決定
- batch 追跡用に `batch_id`, `source_start_date`, `source_end_date` を追加
- `page` / `query` / `country` / `device` は grain に応じて nullable とした
- `sql/bigquery/raw_gsc.sql` に DDL を追加

### 9. 学習メモ
- 何をするか: GSC の raw 集計結果を BigQuery へそのまま保存するテーブルを定義する
- なぜその GCP サービスを使うか: `BigQuery` は集計と分析に向いた保存先で、partition と clustering を決めると後のクエリコストを抑えやすい
- 代替案は何か: grain ごとに別テーブルを作る
- 今回はなぜその案を選ぶか: 取得ジョブを単純にしやすく、1 source 1 raw table の運用に揃えやすいため
- 実行コマンドの意味: 今回は `sql/bigquery/raw_gsc.sql` として DDL を先に記述し、後で BigQuery に適用できる形にした
- 次に確認するポイント: `raw_ga4` でも同じく multi-grain 1 table にするか、`landing_page_daily` をどう表現するか

### 2026-03-08 E2-T3 取得対象の指標と粒度を確定

### 1. Goal
GSC と GA4 の取得対象指標と粒度を固定し、後続の BigQuery raw テーブル設計で迷わない状態にする。

### 2. Why
API 接続確認だけでは保存設計に進めず、どの grain を raw に残すかを先に決めないと後戻りが増えるため。

### 3. Scope
- GSC の保存 grain を決定
- GA4 の保存 grain を決定
- MVP 必須指標と保留指標を決定
- 結合キーの方針を明文化
- 契約ドキュメントを追加

今回はやらないこと:
- BigQuery DDL の実装
- URL 正規化ロジックの実装
- Cloud Run Jobs の実装

### 4. Files to change
- `docs/data_source_contract.md`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. 要件と接続確認結果を見直す
2. GSC 側の MVP 必須粒度を決める
3. GA4 側の MVP 必須粒度を決める
4. GSC / GA4 の結合方針を決める
5. `docs/data_source_contract.md` に保存契約を記録

### 6. Risks
- GSC は `page_query_daily` を入れると行数が増える
- GA4 は `key_events` の定義が property 側で未確定だと値が安定しない
- GSC `page` と GA4 `landing_page` は URL 正規化なしではずれることがある

### 7. Validation
- GSC の保存 grain が 4 つに定義されている
- GA4 の保存 grain が 2 つに定義されている
- raw 列の基準セットが文書化されている
- GSC / GA4 の join strategy が文書化されている

### 8. Progress log
- GSC は `site_daily` `page_daily` `query_daily` `page_query_daily` を保存すると決定
- GA4 は `site_daily` `landing_page_daily` を保存すると決定
- GSC 指標は `clicks/impressions/ctr/position` に固定
- GA4 指標は `sessions/total_users/key_events` とし、`key_events` は未定義期間を許容
- `docs/data_source_contract.md` を追加し、結合方針まで記録

### 9. 学習メモ
- 何をするか: API で取れたデータを、どの単位で raw 保存するか固定する
- なぜその GCP サービスを使うか: 今回の判断自体は API 契約設計だが、後で `BigQuery` にそのまま保存し、`Cloud Run Jobs` で定期取得する前提だから
- 代替案は何か: 先に BigQuery テーブルをざっくり作って後から API に合わせる
- 今回はなぜその案を選ぶか: API 実測結果を見てから保存契約を決めた方が後戻りが少ないため
- 実行コマンドの意味: 今回は新しい GCP コマンド追加はなく、接続確認済みの GSC / GA4 API 結果をもとに保存契約を固定した
- 次に確認するポイント: `E3-T1` で `raw_gsc` に grain をどう表現するか、1 table か partition/clustering をどう切るか

### 2026-03-08 E2-T2 GA4 Data API 接続確認

### 1. Goal
`Google Analytics 4 Data API` に認証し、対象プロパティの最小レポートをローカルから 1 回取得する。

### 2. Why
GSC だけでは CV や主要イベント系の分析が足りないため、GA4 側の API 認可とプロパティ指定方法を先に確認する必要がある。

### 3. Scope
- `Analytics Admin API` と `Analytics Data API` の有効化
- ローカル確認用スクリプト追加
- `analytics.readonly` scope 付き ADC 更新
- `accountSummaries.list` の取得
- `runReport` の最小取得

今回はやらないこと:
- イベント定義やコンバージョン定義の確認
- BigQuery Export の設定
- Cloud Run Jobs への組み込み

### 4. Files to change
- `package.json`
- `scripts/ga4-connection-check.mjs`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `analyticsdata.googleapis.com` と `analyticsadmin.googleapis.com` を有効化
2. `scripts/ga4-connection-check.mjs` を追加
3. `gcloud auth application-default login ... --scopes=...analytics.readonly...`
4. `accountSummaries.list` で見えるプロパティを取得
5. `dataStreams.list` で `yoshilover.com` に対応するプロパティを特定
6. `runReport` で Organic Search の日次 `sessions` / `totalUsers` を取得

### 6. Risks
- `Analytics Admin API` と `Analytics Data API` は別 API なので、片方だけ有効化しても足りない
- `analytics.readonly` scope がないと `insufficient authentication scopes` になる
- プロパティ名とサイトURLが一致しないことがあり、自動特定ロジックが必要になる

### 7. Validation
- `accountSummaries.list` で `properties/260608310` が見える
- `dataStreams.list` で `http://yoshilover.com` に対応する stream が見える
- `runReport` で Organic Search の日次 `sessions` / `totalUsers` が返る

### 8. Progress log
- `analyticsdata.googleapis.com` と `analyticsadmin.googleapis.com` を有効化
- `scripts/ga4-connection-check.mjs` を追加
- 最初は `insufficient authentication scopes` で失敗
- `analytics.readonly` を含む ADC へ更新
- `accountSummaries.list` で 3 アカウント / 複数プロパティを確認
- `properties/260608310` と Web stream `http://yoshilover.com` を対応付け
- `runReport` で Organic Search の日次 `sessions` / `totalUsers` を取得

### 9. 学習メモ
- 何をするか: `Google Analytics 4 Data API` で対象プロパティの最小レポートを取得する
- なぜその GCP サービスを使うか: `Analytics Data API` は GA4 の集計値取得、`Analytics Admin API` はどのプロパティを使うか特定するのに必要
- 代替案は何か: GA4 画面から手動エクスポートする
- 今回はなぜその案を選ぶか: 自動取得に必須で、プロパティIDと stream の対応を先に確定できるため
- 実行コマンドの意味: `gcloud services enable analyticsdata.googleapis.com analyticsadmin.googleapis.com` は GA4 API 有効化、`gcloud auth application-default login ... --scopes=...analytics.readonly...` は GA4 読み取り scope 付き ADC 更新、`node scripts/ga4-connection-check.mjs` は `accountSummaries.list` と `runReport` の最小確認
- 次に確認するポイント: `E2-T3` で GSC の `clicks/impressions/ctr/position` と GA4 の `sessions/totalUsers` をどの粒度で保存するか

### 2026-03-08 E2-T1 GSC API 接続確認

### 1. Goal
`Google Search Console API` へ認証し、対象サイトの最小データをローカルから 1 回取得する。

### 2. Why
MVP では GSC データ取得が中核であり、API 認可方式とレスポンス構造を早めに確認しておく必要があるため。

### 3. Scope
- `Search Console API` の有効化
- ローカル確認用スクリプト追加
- OAuth Client / ADC の設定
- `sites.list` の取得
- `searchAnalytics.query` の最小取得

今回はやらないこと:
- Cloud Run Jobs への組み込み
- BigQuery 保存
- 指標と粒度の最終確定

### 4. Files to change
- `package.json`
- `scripts/gsc-connection-check.mjs`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `Search Console API` を有効化
2. `scripts/gsc-connection-check.mjs` を追加
3. `OAuth Client ID` を `デスクトップ アプリ` で作成
4. `gcloud auth application-default login --client-id-file=... --scopes=...webmasters.readonly...`
5. `node scripts/gsc-connection-check.mjs` を実行

### 6. Risks
- `gcloud auth print-access-token` だけでは `Search Console API` に必要な scope が足りない
- `siteUrl` は数値IDではなく `https://yoshilover.com/` や `sc-domain:yoshilover.com` の文字列で指定する
- 今回のアカウントで見えていたのは `sc-domain:yoshilover.com` ではなく `https://yoshilover.com/` だった

### 7. Validation
- `sites.list` で利用可能プロパティ一覧が返る
- `https://yoshilover.com/` が `siteOwner` として見える
- `searchAnalytics.query` で 2026-02-25 から 2026-03-03 の日次 7 行が返る

### 8. Progress log
- `Search Console API` を有効化
- `scripts/gsc-connection-check.mjs` を追加し、ADC 優先で token を取るように実装
- 最初は `insufficient authentication scopes` で失敗
- `デスクトップ アプリ` の OAuth Client を作成し、`webmasters.readonly` を含む ADC を作成
- `sites.list` で 5 プロパティを確認
- `searchAnalytics.query` を `https://yoshilover.com/` で実行し、日次 7 行取得を確認

### 9. 学習メモ
- 何をするか: `Google Search Console API` でサイト一覧と検索分析データを取得する
- なぜその GCP サービスを使うか: `Google Search Console API` は検索クリック数、表示回数、CTR、掲載順位の一次データ取得元だから
- 代替案は何か: Search Console 画面から手動エクスポートする
- 今回はなぜその案を選ぶか: MVP の自動取得に必須で、レスポンス構造を先に理解できるため
- 実行コマンドの意味: `gcloud services enable searchconsole.googleapis.com` は API 有効化、`gcloud auth application-default login ... --scopes=...webmasters.readonly...` は GSC 読み取り scope 付き ADC 作成、`node scripts/gsc-connection-check.mjs` は `sites.list` と `searchAnalytics.query` の最小確認
- 次に確認するポイント: `GA4 Data API` の property 指定方法、GSC 側 `https://yoshilover.com/` と GA4 側の対象をどう対応づけるか

### 2026-03-08 G0-T5 Cloud Logging / Cloud Monitoring で実行ログ確認

### 1. Goal
`Cloud Run` サービスの実行ログと基本メトリクスを確認し、障害時にどこを見るかの入口を作る。

### 2. Why
本番運用では「デプロイできた」だけでは不十分で、実行時の失敗やトラフィック状況を追えることが必要だから。

### 3. Scope
- サンプルサービスに追加リクエストを送る
- `Cloud Logging` で request / stdout / system log を確認
- `Cloud Monitoring` で `run.googleapis.com/request_count` を確認
- 学習メモを記録

今回はやらないこと:
- アラートポリシーの作成
- ダッシュボード作成
- エラーレートやレイテンシの深掘り

### 4. Files to change
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `curl` で `seo-analyzer-sample` に複数回アクセスしてトラフィックを発生
2. `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="seo-analyzer-sample"' --limit=10`
3. `gcloud auth print-access-token` で user token を取得
4. `https://monitoring.googleapis.com/v3/projects/baseballsite/timeSeries` を `curl` し、`run.googleapis.com/request_count` を取得
5. 確認結果を `TASKS.md` と `docs/PLANS.md` に反映

### 6. Risks
- `Cloud Monitoring` メトリクスは数分遅延することがあり、直後は `0` に見えることがある
- `Application Default Credentials` は未設定のままだったため、今回は user token で確認した
- ログ確認だけでは長期運用に足りないため、将来はアラートやダッシュボードが必要

### 7. Validation
- `gcloud logging read ...` で `run.googleapis.com/requests` `run.googleapis.com/stdout` `run.googleapis.com/varlog/system` が確認できる
- 最新リビジョン `seo-analyzer-sample-00003-88c` の startup log と request log が確認できる
- `Cloud Monitoring` の `run.googleapis.com/request_count` で最新リビジョンに値が入っている

### 8. Progress log
- `seo-analyzer-sample` に 5 回の追加リクエストを送信
- `Cloud Logging` で request log、startup probe 成功 log、stdout の `sample server listening on 8080` を確認
- `Cloud Monitoring` の `run.googleapis.com/request_count` を API 経由で確認
- 最新リビジョン `seo-analyzer-sample-00003-88c` に 5 分窓で `6` リクエスト入っていることを確認

### 9. 学習メモ
- 何をするか: Cloud Run の実行ログと基本メトリクスを見る
- なぜその GCP サービスを使うか: `Cloud Logging` はアプリとプラットフォームの実行記録、`Cloud Monitoring` はリクエスト数などの時系列メトリクス確認に使う
- 代替案は何か: Google Cloud Console の画面だけで確認する
- 今回はなぜその案を選ぶか: `gcloud` と API で確認できるようにしておくと、再現性が高く学習もしやすい
- 実行コマンドの意味: `gcloud logging read` はログ検索、`gcloud auth print-access-token` は API 呼び出し用の user token 取得、`curl ... monitoring.googleapis.com/v3/.../timeSeries` は Cloud Monitoring の時系列データ取得
- 次に確認するポイント: `E2-T1` で Google Search Console API にどう認可するか、`gcloud auth application-default login` をどう整備するか

### 2026-03-08 G0-T4 Secret Manager 登録と Cloud Run からの参照確認

### 1. Goal
`Secret Manager` にシークレットを登録し、`Cloud Run` サービスが専用 Service Account 経由でその値を参照できることを確認する。

### 2. Why
本番では API キーや OAuth Secret をコードや通常環境変数に直書きせず、`Secret Manager` から安全に渡す必要があるため。

### 3. Scope
- 学習用シークレットの作成
- `seo-web-runtime` への `Secret Accessor` 付与
- サンプルアプリに「シークレットが読めたか」の確認値を追加
- `Cloud Run` へ secret 環境変数を注入して再デプロイ
- HTTPS レスポンス確認

今回はやらないこと:
- 本番 API キーの登録
- Secret のボリュームマウント
- `seo-batch-runtime` 側への権限付与

### 4. Files to change
- `server.js`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `server.js` に `sampleSecretPresent` を追加
2. `gcloud secrets create seo-sample-message --replication-policy=automatic --data-file=/tmp/seo-sample-message.txt`
3. `gcloud secrets add-iam-policy-binding seo-sample-message --member=serviceAccount:seo-web-runtime@baseballsite.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`
4. `gcloud builds submit --tag asia-northeast1-docker.pkg.dev/baseballsite/seo-analyzer/seo-analyzer-sample:20260308-114503`
5. `gcloud run deploy seo-analyzer-sample ... --update-secrets SAMPLE_SECRET_MESSAGE=seo-sample-message:1`
6. `curl` と `gcloud run services describe` で反映確認

### 6. Risks
- 公開 URL に secret 値そのものを返すと危険なので、今回は存在確認だけ返す
- Secret を `latest` で参照すると意図しないローテーション影響を受けるため、学習段階では version `1` を固定
- 将来 `seo-batch-runtime` にも別途 access 付与が必要になる

### 7. Validation
- `gcloud secrets versions access 1 --secret=seo-sample-message --project=baseballsite` が成功
- `gcloud run services describe seo-analyzer-sample ...` に `SAMPLE_SECRET_MESSAGE` の `secretKeyRef` が表示される
- `curl https://seo-analyzer-sample-487178857517.asia-northeast1.run.app` の JSON に `sampleSecretPresent: true` が返る

### 8. Progress log
- `server.js` に `sampleSecretPresent` を追加
- `Secret Manager` に `seo-sample-message` を作成し version `1` を登録
- `seo-web-runtime` に `roles/secretmanager.secretAccessor` を付与
- サンプルイメージを再 build / push
- `Cloud Run` に `SAMPLE_SECRET_MESSAGE=seo-sample-message:1` を注入して再デプロイ
- HTTPS レスポンスで `sampleSecretPresent: true` を確認

### 9. 学習メモ
- 何をするか: `Secret Manager` に保存した値を `Cloud Run` へ安全に渡す
- なぜその GCP サービスを使うか: `Secret Manager` は秘密情報を中央管理し、アクセス権を Service Account 単位で絞れる
- 代替案は何か: 通常の環境変数に直接値を書く
- 今回はなぜその案を選ぶか: 本番で秘密情報をコードや設定ファイルに残したくないため
- 実行コマンドの意味: `gcloud secrets create` は secret 作成、`gcloud secrets add-iam-policy-binding` は特定 Service Account に secret 読み取り権限を付与、`gcloud run deploy --update-secrets` は Cloud Run に secret を環境変数として注入
- 次に確認するポイント: `Cloud Logging` で `seo-analyzer-sample` のリビジョンログをどこから見るか、失敗時に何を見るか

### 2026-03-08 G0-T3 Artifact Registry 作成と Cloud Run へのサンプルデプロイ

### 1. Goal
`Artifact Registry` に Docker イメージを保存し、`Cloud Run` へ最小サンプルをデプロイして URL で疎通確認する。

### 2. Why
MVP 本番基盤は `Cloud Run` 前提なので、ローカル実装より先に「ビルド -> レジストリ保存 -> 実行」の一連の流れを体験しておくと後続タスクの理解が速い。

### 3. Scope
- 最小 Node.js サンプルアプリの追加
- `Dockerfile` と `.dockerignore` の追加
- `Artifact Registry` リポジトリ作成
- `Cloud Build` で build / push
- `Cloud Run` へ `seo-web-runtime` 指定で公開デプロイ
- HTTPS URL のレスポンス確認

今回はやらないこと:
- Next.js 本体のデプロイ
- カスタムドメイン設定
- Secret Manager 連携

### 4. Files to change
- `package.json`
- `server.js`
- `Dockerfile`
- `.dockerignore`
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `package.json` / `server.js` / `Dockerfile` / `.dockerignore` を追加
2. `gcloud config set run/region asia-northeast1`
3. `gcloud artifacts repositories create seo-analyzer --repository-format=docker --location=asia-northeast1`
4. `gcloud builds submit --tag asia-northeast1-docker.pkg.dev/baseballsite/seo-analyzer/seo-analyzer-sample:20260308-113854`
5. `gcloud run deploy seo-analyzer-sample --image ... --service-account seo-web-runtime@baseballsite.iam.gserviceaccount.com --allow-unauthenticated`
6. `gcloud run services update seo-analyzer-sample --update-env-vars GOOGLE_CLOUD_PROJECT=baseballsite`
7. `curl` でレスポンス確認

### 6. Risks
- ローカル sandbox では待受ポートを開けず、HTTP のローカル確認はできない
- 本番プロジェクトなので、Cloud Run には専用 Service Account を使い続ける必要がある
- リージョンを `asia-northeast1` に固定したため、今後の Artifact Registry / Cloud Run / Cloud Scheduler は同方針で揃える方が分かりやすい

### 7. Validation
- `gcloud artifacts repositories list --location=asia-northeast1 --project=baseballsite` に `seo-analyzer` が表示される
- `gcloud builds submit ...` が `SUCCESS`
- `gcloud run deploy seo-analyzer-sample ...` が成功
- `curl https://seo-analyzer-sample-487178857517.asia-northeast1.run.app` で JSON が返る
- `gcloud run services describe seo-analyzer-sample ...` で `seo-web-runtime@baseballsite.iam.gserviceaccount.com` が設定されている

### 8. Progress log
- 依存なしで動く最小 Node.js サンプルを追加
- `asia-northeast1` に Artifact Registry `seo-analyzer` を作成
- `Cloud Build` で `seo-analyzer-sample:20260308-113854` を build / push
- `Cloud Run` に `seo-analyzer-sample` を公開デプロイ
- 確認用に `GOOGLE_CLOUD_PROJECT=baseballsite` を設定し、HTTP 応答で `projectId` を返すようにした
- `curl` で `{ "ok": true }` を含む JSON レスポンスを確認

### 9. 学習メモ
- 何をするか: コンテナを作って `Artifact Registry` に保存し、`Cloud Run` で実行する
- なぜその GCP サービスを使うか: `Artifact Registry` はコンテナ保管庫、`Cloud Build` はリモートビルド、`Cloud Run` はコンテナをサーバー管理なしで動かす実行基盤
- 代替案は何か: `gcloud run deploy --source` でソースから直接デプロイする
- 今回はなぜその案を選ぶか: タスク名どおり `Artifact Registry` を先に体験でき、イメージの保存場所と実行基盤の分離が理解しやすい
- 実行コマンドの意味: `gcloud artifacts repositories create` は Docker レジストリ作成、`gcloud builds submit --tag ...` はソースからコンテナをビルドして push、`gcloud run deploy` はそのイメージを Cloud Run サービスとして公開、`gcloud run services update --update-env-vars` は実行環境の値を変更
- 次に確認するポイント: `Secret Manager` に値を登録し、`seo-web-runtime` にその secret を読ませるには何の権限が必要か

### 2026-03-08 G0-T2 IAM 設計

### 1. Goal
本番プロジェクト `baseballsite` で、Cloud Run Web と Cloud Run Jobs の実行主体を分離し、デフォルトの広すぎる権限を避ける。

### 2. Why
既存の Compute Engine default service account に `roles/editor` が付与されており、そのまま使うと最小権限にならないため。

### 3. Scope
- 既存 Service Account の確認
- 専用 Service Account の作成
- デプロイ時に使えるよう `roles/iam.serviceAccountUser` を付与
- 今後付与するリソース単位権限の整理

今回はやらないこと:
- `Secret Manager` の secret 単位権限付与
- `BigQuery` の dataset 単位権限付与
- デフォルト Compute Engine Service Account から `roles/editor` を剥がす作業

### 4. Files to change
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `gcloud iam service-accounts list --project=baseballsite` で既存 Service Account を確認
2. デフォルト Compute Engine Service Account の IAM を確認
3. `seo-web-runtime` を作成
4. `seo-batch-runtime` を作成
5. `fwns6760@gmail.com` に各 Service Account の `roles/iam.serviceAccountUser` を付与

### 6. Risks
- 本番プロジェクトのため、プロジェクト単位の広いロール付与は避ける
- `Secret Manager` と `BigQuery` は実体ができてから resource-level で権限を付ける方が安全
- デフォルト Compute Engine Service Account の `roles/editor` は残っているため、誤って使わない運用が必要

### 7. Validation
- `gcloud iam service-accounts list --project=baseballsite` に `seo-web-runtime` と `seo-batch-runtime` が表示される
- `gcloud iam service-accounts add-iam-policy-binding ... --role=roles/iam.serviceAccountUser` が成功する
- 今後の Cloud Run / Cloud Run Jobs デプロイで専用 Service Account を選べる

### 8. Progress log
- 既存 Service Account は `487178857517-compute@developer.gserviceaccount.com` のみと確認
- その Service Account に `roles/editor` が付いていることを確認
- `seo-web-runtime@baseballsite.iam.gserviceaccount.com` を作成
- `seo-batch-runtime@baseballsite.iam.gserviceaccount.com` を作成
- `fwns6760@gmail.com` に各 Service Account の `roles/iam.serviceAccountUser` を付与

### 9. 学習メモ
- 何をするか: Cloud Run Web と Cloud Run Jobs で使う専用 Service Account を分ける
- なぜその GCP サービスを使うか: IAM は「誰が何をできるか」を管理するための基盤で、最小権限にするために Service Account を用途ごとに分離する
- 代替案は何か: デフォルト Compute Engine Service Account をそのまま使う
- 今回はなぜその案を選ぶか: 既に `roles/editor` が付いていて権限が広すぎるため、本番運用には向かない
- 実行コマンドの意味: `gcloud iam service-accounts create` は専用実行主体の作成、`gcloud iam service-accounts add-iam-policy-binding` はその Service Account をあなたが使えるようにする
- 次に確認するポイント: `Artifact Registry` にイメージを置き、`Cloud Run` デプロイ時に `seo-web-runtime` を指定できるか

### 2026-03-08 G0-T1 Google Cloud プロジェクト初期化

### 1. Goal
本番プロジェクト `baseballsite` を `gcloud` から操作できる状態にし、MVP に必要な主要 API を有効化する。

### 2. Why
Cloud Run、BigQuery、Secret Manager などの以後の作業は、対象プロジェクトの選択と API 有効化が前提になるため。

### 3. Scope
- `gcloud` のインストール
- `gcloud auth login` による CLI 認証
- `gcloud config set project baseballsite`
- 主要 API の有効化確認
- `cloudbuild.googleapis.com` の有効化

今回はやらないこと:
- Service Account 作成
- IAM ロール付与
- Cloud Run デプロイ

### 4. Files to change
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. Ubuntu 24.04 (WSL2) に `Google Cloud CLI` をインストール
2. `gcloud auth login --no-launch-browser` で認証
3. `gcloud config set project baseballsite` で対象プロジェクトを固定
4. `gcloud services list --enabled --project=baseballsite` で主要 API を確認
5. `gcloud services enable cloudbuild.googleapis.com --project=baseballsite` を実行

### 6. Risks
- `gcloud auth login` はブラウザ認証が必要なため、WSL からは URL と認証コードの受け渡しが発生する
- 端末によっては `gcloud auth application-default login` も追加で必要になる
- 本番プロジェクトなので、今後の IAM 付与は最小権限で進める必要がある

### 7. Validation
- `gcloud auth list` で `fwns6760@gmail.com` が active
- `gcloud config get-value project` で `baseballsite`
- `gcloud services list --enabled --project=baseballsite` に主要 API が表示される
- `gcloud services enable cloudbuild.googleapis.com --project=baseballsite` が成功

### 8. Progress log
- `gcloud` を Ubuntu 24.04 にインストール
- 通常設定の `gcloud auth login` を完了
- `baseballsite` を既定プロジェクトに設定
- `run.googleapis.com` `artifactregistry.googleapis.com` `bigquery.googleapis.com` `cloudscheduler.googleapis.com` `iam.googleapis.com` `logging.googleapis.com` `monitoring.googleapis.com` `secretmanager.googleapis.com` の有効化を確認
- `cloudbuild.googleapis.com` を有効化して G0-T1 完了条件を満たした

### 9. 学習メモ
- 何をするか: `Google Cloud CLI` から本番プロジェクトを操作し、主要 API を有効化する
- なぜその GCP サービスを使うか: `Cloud Run` は Web と Job の実行基盤、`BigQuery` は分析保存先、`Secret Manager` は秘密情報管理、`Cloud Scheduler` は定期実行、`Cloud Logging` と `Cloud Monitoring` は障害確認に必要
- 代替案は何か: `Google Cloud Console` だけで設定する、または最初から `Terraform` を使う
- 今回はなぜその案を選ぶか: 学習段階では `gcloud` の方がサービス間の関係を理解しやすく、MVP 初期構築も速い
- 実行コマンドの意味: `gcloud auth login` は CLI 認証、`gcloud config set project baseballsite` は操作対象固定、`gcloud services list --enabled` は有効 API 確認、`gcloud services enable cloudbuild.googleapis.com` は Cloud Build API 有効化
- 次に確認するポイント: `G0-T2` で Service Account を何用途に分けるか、各用途に必要な最小ロールは何か

### 2026-03-07 E1-T1 Supabase プロジェクト作成

### 1. Goal
認証基盤の最初の前提として、Supabase プロジェクトを利用可能な状態にする。

### 2. Scope
- Supabase プロジェクト URL の確認
- Publishable key / anon key の取得確認
- タスク管理ファイル更新

### 3. Result
- Project URL: `https://kpkpkchwimcerqrdurnf.supabase.co`
- 公開キーの取得確認完了
- `TASKS.md` の E1-T1 を Done に更新

### 4. Next
- E1-T2 Google OAuth 設定

### 2026-03-07 E1-T2 Google OAuth 設定（準備）

### 1. Goal
Supabase Auth の Google Provider を有効化し、Next.js から Google ログイン可能にする。

### 2. Scope
- OAuth callback URL の確定
- Google Cloud Console 側で必要な設定項目の確定
- 未完了条件（待ち項目）の明示

### 3. Result
- Callback URL を確定: `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`
- Supabase 公式フローを確認し、必要作業を確定
  1. Google Cloud Console で OAuth 同意画面を作成
  2. OAuth クライアント(Web)を作成し、上記 callback URL を登録
  3. Supabase Dashboard > Authentication > Providers > Google に Client ID / Secret を保存

### 4. Waiting
- Google OAuth Client ID
- Google OAuth Client Secret

### 5. Next
- E1-T3 Next.js 側 Supabase SSR client 実装（E1-T2 完了後）

### 2026-03-08 E1-T2 Google OAuth 設定（実行メモ整理）

### 1. Goal
`Supabase Auth` の `Google provider` 設定で迷わないように、固定値と GUI 入力値を先に整理する。

### 2. Scope
- Supabase 公式ドキュメントの再確認
- `Google Cloud Console` と `Supabase Dashboard` に入れる値の確定
- `docs` 配下への手順メモ追加

### 3. Result
- Supabase 公式 `Login with Google` の Web 手順を確認
- `Google OAuth client` は `Web application` を使う方針を確定
- Google 側に入れる redirect URI を再確認: `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`
- ローカル開発では `Authorized JavaScript origins` に `http://localhost:3000` を入れる方針を確定
- Supabase の redirect allow list には `http://localhost:3000/auth/callback` を入れる方針を確定
- 実行メモを `docs/google_oauth_setup.md` に追加

### 4. Waiting
- なし

### 5. Notes
- Google に登録する redirect URI と、Supabase の redirect allow list は役割が違う
- Google には `Supabase Callback URL` を入れる
- Next.js 側 callback route は後続の `E1-T3` で実装する
- 本番 Web URL はまだ未確定なので、今回 Google の JavaScript origin は `http://localhost:3000` のみで進める

### 6. Next
- `E1-T3 Next.js 側 Supabase SSR client 実装` に着手

### 7. Final Result
- `Google Cloud Console` で `seo-analyzer-supabase-web` の OAuth client を作成
- `Authorized JavaScript origins`: `http://localhost:3000`
- `Authorized redirect URIs`: `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`
- `Supabase Dashboard > Authentication > Providers > Google` で provider を有効化
- `Supabase Dashboard > Authentication > URL Configuration` に `http://localhost:3000/auth/callback` を追加

### 2026-03-08 E1-T3-E1-T6 Next.js Auth Scaffold 実装

### 1. Goal
`Next.js App Router` で `Supabase Auth + Google OAuth` の最小ログイン基盤を作る。

### 2. Scope
- `Next.js + TypeScript` の導入
- `@supabase/ssr` で browser / server / proxy client を分離
- OAuth callback route 実装
- 保護ルート、ログイン画面、ログアウト処理の追加
- `next build` による検証

### 3. Result
- `Next.js 16` と `TypeScript` を追加
- `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx` を追加
- `utils/supabase/client.ts`, `server.ts`, `middleware.ts`, `env.ts` を追加
- `proxy.ts` で session refresh 用の proxy を追加
- `app/auth/callback/route.ts` で `exchangeCodeForSession` を実装
- `app/auth/login/route.ts` で `signInWithOAuth({ provider: "google" })` を server 側から開始
- `app/auth/signout/route.ts` で server 側ログアウトを実装
- ルート `/` は未ログイン時に `/login?next=/` へ redirect
- `npm run build` が通ることを確認
- `npm run batch:job:dry-run` も再実行し、既存 batch script が壊れていないことを確認

### 4. Notes
- `@supabase/ssr` を使う理由は、`App Router` の Server Component と cookie ベース session を公式パターンで扱えるから
- 代替案は `@supabase/supabase-js` を client 側だけで使う方法だが、要件の `Server Component` 基本方針と相性が悪い
- ログイン開始とログアウトは `route.ts` に寄せ、Client Component を増やさない構成を選んだ
- `middleware.ts` は `Next.js 16` で非推奨のため、`proxy.ts` を採用した

### 5. Next
- `E1-T7 ローカルでログイン確認`
- `http://localhost:3000/login` をブラウザで開き、Google ログインから callback / session 保存 / `/` 表示まで確認する

### 2026-03-08 E1-T7 ローカルでログイン確認

### 1. Goal
ローカルの `Next.js` で `Supabase Auth + Google OAuth` が最後まで通ることを確認する。

### 2. Scope
- `.env.local` の追加
- `next dev` 起動
- Google ログイン開始
- callback 後の session 保存確認
- ログイン失敗時の切り分け

### 3. Result
- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を追加
- `http://localhost:3000/login` でログイン画面表示を確認
- 初回失敗原因を調査し、`/auth/login` の redirect が `307` で `POST` 維持になっていたことを特定
- `app/auth/login/route.ts` と `app/auth/signout/route.ts` の redirect を `303` に修正
- Google ログイン後に `Supabase Auth` callback を通ってローカル `/` へ戻れることを確認

### 4. Notes
- `Next.js` で form POST 後に外部 OAuth へ飛ばす場合、`307` だと HTTP メソッドが維持されて壊れる
- 今回は `303 See Other` に変えることで、OAuth 開始を `GET` に切り替えて解消した

### 5. Next
- `E1-T8 Cloud Run 本番でログイン確認`
- 本番 URL を `Google Cloud Console` の JavaScript origin と `Supabase` の redirect allow list に追加したうえで、Cloud Run 上のログインを確認する

### 2026-03-08 E1-T8 Cloud Run 本番でログイン確認（準備）

### 1. Goal
`Cloud Run` 上の本番 URL で `Supabase Auth + Google OAuth` が通る状態を作る。

### 2. Scope
- `Cloud Build` で Web イメージ build / push
- `Cloud Run` へ本番デプロイ
- 本番 URL の確定
- GUI で必要な OAuth 設定値の洗い出し

### 3. Result
- `Cloud Build` で `asia-northeast1-docker.pkg.dev/baseballsite/seo-analyzer/seo-analyzer-web:20260308-e1t8` を build / push
- `Cloud Run` service `seo-analyzer-web` を `asia-northeast1` にデプロイ
- Service URL を確定: `https://seo-analyzer-web-487178857517.asia-northeast1.run.app`
- 未ログイン状態の `/` が `/login?next=/` へ redirect することを `curl -I` で確認

### 4. Waiting
- `Google Cloud Console > Google Auth Platform > Clients` の `Authorized JavaScript origins` に `https://seo-analyzer-web-487178857517.asia-northeast1.run.app` を追加
- `Supabase Dashboard > Authentication > URL Configuration > Redirect URLs` に `https://seo-analyzer-web-487178857517.asia-northeast1.run.app/auth/callback` を追加
- ブラウザで本番ログイン確認

### 5. Notes
- Google 側の `redirect URI` は引き続き `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`
- 本番で増えるのは `Authorized JavaScript origins` と `Supabase Redirect URLs`
- `Cloud Run` では `/` が 307 で `/login?next=/` へ移動するところまで確認済み

### 6. Next
- GUI 設定完了後に本番 URL から Google ログインを実行
- `E1-T8` を Done に更新

### 2026-03-07 E1-DB1 認証基盤向け初期マイグレーション

### 1. Goal
Google OAuth 連携後に即座に利用できる認証ユーザープロフィール基盤を先に作成する。

### 2. Scope
- `public.profiles` テーブル作成
- RLS ポリシーの適用
- `auth.users` と同期するトリガーの追加
- Security Advisor 警告の解消

### 3. Result
- Migration: `init_auth_profiles`
- Migration: `fix_profiles_trigger_function_search_path`
- `public.profiles` 作成（`id` PK / `auth.users.id` FK）
- RLS 有効化と本人向け policy（select / insert / update）を追加
- Security Advisor（security）で警告 0 件を確認

### 4. Next
- E1-T2 Google OAuth 設定を完了
- E1-T3 Next.js 側 Supabase SSR client 実装へ着手
