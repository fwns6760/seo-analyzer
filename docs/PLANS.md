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

### 2026-03-18 既存 GCP 環境の再利用確認と OAuth 切り分け

### 1. Goal
既存 `baseballsite` 環境を最短で再利用できるかを確認し、止まっている `seo-fetch-job` の失敗原因を特定する。

### 2. Why
新規 GCP 再構築や IaC 化の前に、既存の `Cloud Run` / `Cloud Run Jobs` / `BigQuery` / `Secret Manager` / `GitHub Actions` 基盤がそのまま使えるなら、それが最速だから。

### 3. Scope
- 既存の GCP リソース存在確認
- `Cloud Run` Web の疎通確認
- `seo-fetch-job` の直近失敗原因の特定
- local ADC から OAuth secret を更新して復旧可否を確認

今回はやらないこと:
- 新規 GCP プロジェクトの再構築
- Terraform 化
- batch ロジックそのものの改修

### 4. Files to change
- `TASKS.md`
- `docs/PLANS.md`

### 5. Implementation steps
1. `gcloud run` / `bq` / `gcloud secrets` / `gcloud scheduler` / `gcloud iam` で既存リソースを確認する
2. `curl` と `npm run data:readiness` で Web と BigQuery の現況を確認する
3. `gcloud run jobs executions describe` と `gcloud logging read` で `seo-fetch-job` の失敗理由を確認する
4. local ADC から `Secret Manager` の OAuth secret を更新する
5. `gcloud run jobs execute` で手動実行し、次の失敗点まで切り分ける

### 6. Risks
- local ADC が有効でも `Search Console API` / `GA4` に必要な scope が不足している可能性がある
- `Secret Manager` の更新だけでは scope 不足は直らない
- 本番 batch は raw append 運用なので、復旧後の再実行で同 date range の別 batch が増える

### 7. Validation
- `seo-analyzer-web` と `seo-fetch-job` の存在が確認できる
- `/login` が HTTP `200` を返す
- `data:readiness` が `BigQuery` から読める
- `seo-fetch-job` の失敗理由がログ文字列で確定できる

### 8. Progress log
- `seo-analyzer-web`、`seo-fetch-job`、`seo_raw` / `seo_mart`、OAuth 3 secret、実行用 Service Account、`GitHub Actions` 用 `Workload Identity Provider`、`seo-fetch-daily` の存在を確認した
- `seo-analyzer-web` の `/login` は HTTP `200` を返し、`data:readiness` は `status = ready` を返した
- `seo-fetch-job` は `2026-03-15` 以降 3 連続で失敗しており、最初の原因は refresh token の `invalid_grant` だった
- local ADC の `client_id` / `client_secret` / `refresh_token` から `Secret Manager` の version `2` を追加した
- 手動 execution `seo-fetch-job-6pbbr` では `Search Console API` の `ACCESS_TOKEN_SCOPE_INSUFFICIENT` まで進み、refresh token 失効の先に scope 不足が残っていると確認した
- `Secret Manager` version `1` の独自 `Desktop App` client を使って ADC を取り直し、`gcloud` 既定 client の quota project 問題を回避した
- `scripts/gsc-connection-check.mjs` と `scripts/ga4-connection-check.mjs` が成功し、`Search Console` と `GA4` の両方で必要 scope を確認した
- その ADC 由来の `client_id` / `client_secret` / `refresh_token` を `Secret Manager` の version `3` として追加した
- 手動 execution `seo-fetch-job-9gwwr` は成功し、`Cloud Logging` では GSC `1179` 行、GA4 `170` 行の insert を確認した
- `npm run data:readiness -- --json` で `raw_gsc_latest_date = 2026-03-14`、`raw_ga4_latest_date = 2026-03-14`、`page_daily_latest_date = 2026-03-14`、`candidate_reference_end_date = 2026-03-14`、`status = ready` まで追従した
- `Cloud Scheduler` `seo-fetch-daily` を手動 run し、`seo-scheduler-invoker@baseballsite.iam.gserviceaccount.com` で execution `seo-fetch-job-5vxjg` が成功することを確認した
- `Cloud Logging` では Scheduler 経由 execution でも GSC `1179` 行、GA4 `170` 行の insert を確認した
- `npm run data:readiness -- --json` では `raw_gsc_latest_day_batches = 2`、`raw_ga4_latest_day_batches = 2` となり、同一 date range の append batch が期待どおり増えることを確認した
- `BigQuery` 直クエリで `2026-03-14` の raw duplicate batch を確認しつつ、`seo_mart.page_daily = 128` 行、`seo_mart.query_daily = 244` 行、`improvement_candidates_base = 792` 行で二重化していないことを確認した
- `page_daily` の日別行数は `2026-03-11: 132`、`2026-03-13: 136`、`2026-03-14: 128` で安定しており、view の `ROW_NUMBER() ... QUALIFY = 1` が latest batch を正しく拾っていると判断した

### 9. 学習メモ
- 何をするか: 既存 GCP 環境が再利用できるかを確認し、止まっている batch の認証失敗を切り分ける
- なぜその GCP サービスを使うか: `Cloud Run` / `Cloud Run Jobs` / `Cloud Scheduler` / `BigQuery` / `Secret Manager` / `IAM` をそれぞれ確認すると、Web、batch、cron、データ、secret、権限のどこで止まっているかを最短で分離できる
- 代替案は何か: 新規環境を作り直す、コード改修から先に進める
- 今回はなぜその案を選ぶか: 最速ルートを要件にしたので、既存環境が生きているなら先に復旧可否を確認する方が早い
- 実行コマンドの意味: `gcloud run services/jobs list` は実行基盤の存在確認、`gcloud secrets list` は secret 確認、`bq ls` と `npm run data:readiness` はデータ基盤確認、`gcloud logging read` は失敗理由の文字列確認、`gcloud secrets versions add` は job が読む OAuth secret の更新、`gcloud run jobs execute` は修復結果の即時確認
- 次に確認するポイント: 2026-03-19 の定刻 `seo-fetch-daily` 実行でも同じ secret version `3` で成功するか、`page_daily` / `candidate_reference_end_date` が日次で追従するか

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

### 2026-03-09 E1-T8 完了扱いへの更新

### 1. Goal
保留にしていた `E1-T8` をタスク上は閉じ、次のデプロイ自動化へ進める。

### 2. Scope
- `TASKS.md` / `docs/TASKS.md` の status 更新
- 補足メモの追加

今回はやらないこと:
- `Cloud Run` の再デプロイ
- ブラウザでの追加ログイン実行

### 3. Result
- `Epic 1` を `Done` へ更新
- `E1-T8` を完了扱いに更新
- current focus を `E6-T3` へ移動

### 4. Notes
- `Cloud Run` 本番 URL と必要な OAuth 追加設定はすでに整理済み
- 最終ブラウザ確認はこの変更では実施せず、運用上の手元確認へ寄せる

### 5. Next
- `E6-T1 GitHub リポジトリ初回 push とブランチ運用方針整理`
- `E6-T2 デプロイ方式選定`

### 2026-03-09 E6-T1 GitHub リポジトリ初回 push とブランチ運用方針整理

### 1. Goal
GitHub 連携デプロイの前提として、リポジトリ接続状態と最小のブランチ運用方針を確定する。

### 2. Scope
- `git remote` と tracking branch の確認
- デプロイ対象 branch と通常作業 branch のルール整理

今回はやらないこと:
- GitHub 側の branch protection 設定
- Pull Request template の追加

### 3. Result
- `origin` が `git@github.com:fwns6760/seo-analyzer.git` を向いていることを確認
- 現在の branch `main` が `origin/main` を tracking していることを確認
- 運用方針を次で固定
  - デプロイ対象 branch は `main`
  - 通常作業は `feat/*` または `task/*` branch で進める
  - `main` へ入れる前に `npm run build` を通す

### 4. Notes
- これで `E6-T1` の「初回 push と運用方針整理」は満たせる
- GitHub 側の保護設定は後で必要になれば追加する

### 5. Next
- `E6-T2` で `Cloud Build Trigger` と `GitHub Actions` のどちらで行くか確定する

### 2026-03-09 E6-T2 デプロイ方式選定 / E6-T3 準備

### 1. Goal
`main` push を起点に `Cloud Run` Web へ自動反映する方式を決め、実装ファイルの雛形まで用意する。

### 2. Why
毎回ローカルから `gcloud builds submit` と `gcloud run deploy` を手で打つ運用は再現性が弱く、次の画面実装フェーズで手戻りしやすいため。

### 3. Scope
- `Cloud Build Trigger` と `GitHub Actions` を比較
- 今回採用する方式を決定
- `cloudbuild.web.yaml` を追加して Web 用 build/deploy 手順をファイル化

今回はやらないこと:
- 実際の trigger 作成
- batch/job 側の trigger 作成
- GitHub 側 secret 管理

### 4. Files to change
- `cloudbuild.web.yaml`
- `TASKS.md`
- `docs/TASKS.md`
- `docs/PLANS.md`

### 5. Decision
- 採用: `Cloud Build Trigger`
- 代替案: `GitHub Actions` から `gcloud` deploy
- 今回 `Cloud Build Trigger` を選ぶ理由
  - build と deploy を `Google Cloud` 側に寄せると、認証情報を GitHub 側へ広く持たせずに済む
  - 既に `Artifact Registry`、`Cloud Run`、`Cloud Build` を使っているので学習対象が一本化される
  - 既存の `cloudbuild.job.yaml` と運用の形をそろえやすい

### 6. Result
- `E6-T2` を `Done` にできる判断を確定
- `cloudbuild.web.yaml` を追加し、`Dockerfile` build -> `Cloud Run` deploy を 1 ファイルへ集約
- current focus を `E6-T3` へ更新

### 7. 学習メモ
- 何をするか: `GitHub` の `main` push をきっかけに `Cloud Build` が動き、`Cloud Run` の Web サービスを更新する流れを作る
- なぜその GCP サービスを使うか: `Google Cloud Build` は GitHub 連携 trigger、Docker build、`Cloud Run` デプロイを同じ GCP 内で扱える
- 代替案は何か: `GitHub Actions` で build と deploy を行う
- 今回はなぜその案を選ぶか: 既に GCP サービスを学習しながら進めているため、認証と運用を GCP 側へ寄せた方が理解しやすい
- 実行コマンドの意味: `gcloud builds triggers create github` は GitHub push を受ける trigger 作成、`cloudbuild.web.yaml` は build/deploy 手順の定義、`gcloud run deploy` は最終的に `Cloud Run` の revision を更新する
- 次に確認するポイント: trigger 作成後に `main` push で build が走るか、`NEXT_PUBLIC_SUPABASE_*` が `Cloud Run` に正しく入るか

### 8. 3点まとめ
- 変更内容: `Cloud Build Trigger` を採用し、Web 用の `cloudbuild.web.yaml` を追加した
- 学習ポイント: `Cloud Build` を使うと GitHub からの build/deploy を GCP 側に閉じ込められる
- 次にやること: trigger を実際に作成し、`main` push から `seo-analyzer-web` が更新されることを確認する

### 2026-03-09 E6-T2 方針変更 / E6-T3・E6-T5 GitHub Actions 実装

### 1. Goal
`main` push を起点に `Cloud Run` Web へ自動反映できる状態を、`GitHub Actions` ベースで実装する。

### 2. Why
`Cloud Build Trigger` は `GitHub OAuth` と GitHub App 連携の初期セットアップでブラウザ依存が強く、今回のリポジトリでは詰まりやすかったため。まずは repo 内の workflow で再現しやすい形へ寄せる。

### 3. Scope
- Web 用 deploy workflow を `.github/workflows` に追加
- `GitHub Actions` から `Google Cloud` へ安全に入る認証経路を作る
- Docker build 時と `Cloud Run` runtime 時の環境変数を固定する
- CI 用の service account と権限を最小構成で整理する

今回はやらないこと:
- batch/job 側の workflow 化
- `main` push から本番反映までの実行確認
- branch protection や required checks の整備

### 4. Files to change
- `.github/workflows/deploy-web.yml`
- `Dockerfile`
- `.gitignore`
- `.dockerignore`
- `TASKS.md`
- `docs/TASKS.md`
- `docs/PLANS.md`

### 5. Decision
- 採用: `GitHub Actions + Workload Identity Federation`
- 代替案 1: `Cloud Build Trigger`
- 代替案 2: `GitHub Actions + Service Account Key`
- 今回この案を選ぶ理由
  - `GitHub Actions` は repo に workflow を置くだけなので、初回セットアップの見通しがよい
  - `Workload Identity Federation` を使うと、GitHub 側へ長期の `Service Account Key` を置かずに済む
  - `gcloud run deploy` を workflow 内で明示できるので、学習用にも流れが追いやすい

### 6. GCP changes
- `Service Account` `seo-web-deployer@baseballsite.iam.gserviceaccount.com` を作成
- `Workload Identity Pool` `github-actions` を作成
- OIDC provider `seo-analyzer-web` を作成
- `seo-web-deployer` に `roles/artifactregistry.writer` と `roles/run.admin` を付与
- `seo-web-runtime` に対して `seo-web-deployer` へ `roles/iam.serviceAccountUser` を付与
- GitHub repo `fwns6760/seo-analyzer` から `seo-web-deployer` を引き受けられるよう、`roles/iam.workloadIdentityUser` を付与

### 7. Progress log
- `Cloud Build` 接続は `PENDING_USER_OAUTH` で止まり、repository 作成まで進めなかった
- `GitHub Actions` 方式へ切り替える判断を行った
- `Dockerfile` に build arg を追加し、CI build でも `NEXT_PUBLIC_SUPABASE_*` を渡せるようにした
- `deploy-web.yml` を追加し、`main` push または manual run で build/push/deploy できる workflow を用意した
- `gha-creds-*.json` を `.gitignore` と `.dockerignore` に追加した
- `npm run build` でアプリ build が通ることを確認した
- `git push origin main` は `git@github.com: Permission denied (publickey)` で失敗した。GitHub 側に登録された SSH key または push 経路の見直しが必要
- `~/.ssh/sebata1413` を `ssh-agent` に読み込んだ後は `git push origin main` が成功した
- push 後、`Artifact Registry` に image tag `4f74939724dc59925a18a4d35def53e774608348` が追加され、`Cloud Run` `seo-analyzer-web` は revision `seo-analyzer-web-00002-sn9` へ更新された

### 8. Validation
- `.github/workflows/deploy-web.yml` が存在する
- `GitHub Actions` workflow が `Workload Identity Federation` を使う
- `seo-web-deployer` が `Artifact Registry` push と `Cloud Run` deploy に必要な権限を持つ
- `npm run build` が成功する
- `git push origin main` が通り、workflow 起点の deploy で `Cloud Run` revision が更新される

### 9. 学習メモ
- 何をするか: `GitHub Actions` から `Google Cloud Run` に Web を自動デプロイする
- なぜその GCP サービスを使うか: `Google Cloud IAM Workload Identity Federation` は GitHub から安全に `Google Cloud` へ入るための仕組みで、長期鍵を配らずに済む
- 代替案は何か: `Google Cloud Build Trigger` を使う、または `Service Account Key` を GitHub Secrets に置く
- 今回はなぜその案を選ぶか: `Cloud Build Trigger` はブラウザでの GitHub 連携が詰まりやすく、`Service Account Key` は運用上の負債になりやすい。`GitHub Actions + Workload Identity Federation` が一番バランスがよい
- 実行コマンドの意味: `gcloud iam workload-identity-pools create` は GitHub から入る入口を作る。`gcloud iam workload-identity-pools providers create-oidc` は GitHub OIDC token を信頼する設定。`gcloud projects add-iam-policy-binding` は deploy 用 Service Account に必要ロールを付与する。`gcloud iam service-accounts add-iam-policy-binding` は GitHub repo がその Service Account を使えるようにする
- 次に確認するポイント: `main` push 後に `GitHub Actions` が起動するか、`Artifact Registry` に image が push されるか、`Cloud Run` revision が更新されるか
- 次の作業: `E6-T4` として batch/job 側も `GitHub Actions` 化するか、別経路で運用するかを整理する

### 10. 3点まとめ
- 変更内容: Web deploy を `Cloud Build Trigger` から `GitHub Actions + Workload Identity Federation` に切り替えた
- 学習ポイント: `Workload Identity Federation` を使うと GitHub に長期鍵を置かずに `Google Cloud` へ入れる
- 次にやること: `main` へ push して workflow を走らせ、`Cloud Run` の revision 更新まで確認する

### 2026-03-09 E6-T4 batch/job GitHub Actions 実装

### 1. Goal
`Cloud Run Jobs` の batch も `main` push を起点に自動更新できるようにし、Web と同じ `GitHub Actions + Workload Identity Federation` の流れへそろえる。

### 2. Why
Web だけ自動化されても batch は手動 `gcloud run jobs update` が残り、運用の再現性が落ちるため。`Cloud Scheduler` が呼ぶ本体 job も、コード変更時に同じ GitHub 起点で更新できる形へまとめたい。

### 3. Scope
- batch 用 deploy workflow を `.github/workflows` に追加
- batch 専用 deployer Service Account と OIDC provider を作成
- `Cloud Run Job` の image / env / secret / runtime service account を workflow から更新できるようにする
- 既存の `Cloud Scheduler` 設定を壊さないことを確認する

今回はやらないこと:
- job 実行そのものの自動テスト
- batch 実行結果の内容検証
- 通知や retry 戦略の改善

### 4. Files to change
- `.github/workflows/deploy-job.yml`
- `.github/workflows/deploy-web.yml`
- `TASKS.md`
- `docs/TASKS.md`
- `docs/PLANS.md`
- `cloudbuild.job.yaml` を削除

### 5. Decision
- 採用: `GitHub Actions + Workload Identity Federation` で `Cloud Run Jobs` を更新
- 代替案 1: `Cloud Build Trigger`
- 代替案 2: ローカルから `gcloud run jobs update` を手動実行
- 今回この案を選ぶ理由
  - Web と batch の deploy 導線をそろえられる
  - `Cloud Scheduler` はそのままに、呼び先の job 定義だけ安全に更新できる
  - `Cloud Build Trigger` の GitHub 連携詰まりを batch でも繰り返さずに済む

### 6. GCP changes
- `Service Account` `seo-batch-deployer@baseballsite.iam.gserviceaccount.com` を作成
- OIDC provider `seo-analyzer-batch` を `Workload Identity Pool` `github-actions` に追加
- `seo-batch-deployer` に `roles/artifactregistry.writer` と `roles/run.admin` を付与
- `seo-batch-runtime` に対して `seo-batch-deployer` へ `roles/iam.serviceAccountUser` を付与
- GitHub repo `fwns6760/seo-analyzer` から `seo-batch-deployer` を引き受けられるよう、`roles/iam.workloadIdentityUser` を付与

### 7. Progress log
- `seo-fetch-job` の現在設定を確認し、env / secret / runtime service account を workflow に明文化した
- `deploy-job.yml` を追加し、batch 用 image build -> push -> `gcloud run jobs update` を 1 workflow にまとめた
- `deploy-web.yml` に path filter を追加し、batch 変更で不要な web deploy が走らないようにした
- batch 用 deployer と OIDC provider を作成し、必要ロールを最小構成で付与した
- `npm run batch:job:dry-run` で batch entrypoint の最低限確認を行った
- commit `9347980` の push 後、`Artifact Registry` に `seo-batch-job:9347980a45ca39d8aa5f6af5554d9d99504fd603` が追加され、`seo-fetch-job` は generation `6` / image tag `9347980a45ca39d8aa5f6af5554d9d99504fd603` へ更新された

### 8. Validation
- `.github/workflows/deploy-job.yml` が存在する
- `seo-batch-deployer` と `seo-analyzer-batch` provider が存在する
- `npm run batch:job:dry-run` が成功する
- `main` push 後に `Artifact Registry` と `Cloud Run Job` の image が新しい commit SHA へ更新される
- `Cloud Scheduler` の対象 URI が引き続き `seo-fetch-job:run` のままである

### 9. 学習メモ
- 何をするか: batch 用の `Cloud Run Jobs` も `GitHub Actions` から自動更新する
- なぜその GCP サービスを使うか: `Google Cloud Run Jobs` は一回実行 batch に向いていて、`Google Cloud Scheduler` からの定期起動と責務分離しやすい
- 代替案は何か: `Cloud Build Trigger` を使う、またはローカルから `gcloud run jobs update` を続ける
- 今回はなぜその案を選ぶか: Web と同じ `GitHub Actions + Workload Identity Federation` にそろえると、運用と学習の両方で理解しやすい
- 実行コマンドの意味: `gcloud iam service-accounts create` は deployer identity 作成、`gcloud iam workload-identity-pools providers create-oidc` は GitHub OIDC token を信頼する設定、`gcloud run jobs update` は batch の image と env / secret を新しい定義に更新する
- 次に確認するポイント: `Cloud Scheduler` 経由の次回実行で最新 image が使われるか、必要なら batch 実行失敗時の検知をどこまで自動化するか

### 10. 3点まとめ
- 変更内容: batch deploy を `GitHub Actions + Workload Identity Federation` に追加し、`Cloud Run Jobs` も GitHub push 起点で更新できるようにした
- 学習ポイント: `Cloud Run Jobs` は `Cloud Scheduler` と分離したまま、`gcloud run jobs update` で安全に継続デプロイできる
- 次にやること: `Epic 6` は完了なので、次は `E4-T1` のダッシュボード画面実装へ進む

### 2026-03-09 E4-T1 ダッシュボード画面

### 1. Goal
`BigQuery` の集計 view を server 側から読み、MVP の最初のダッシュボード画面を実装する。

### 2. Why
データ基盤と deploy 導線は揃ったので、次は「毎週の手集計を減らす」本体価値を画面で見えるようにする必要があるため。

### 3. Scope
- `page_daily` から全体 KPI を取得する
- `improvement_candidates_base` から改善候補を取得する
- Server Component でダッシュボード画面を作る
- 既存の認証済みトップページをダッシュボードへ置き換える

今回はやらないこと:
- 記事分析、クエリ分析、改善候補一覧の専用画面
- 本格的なフィルタや期間切り替え UI
- `loading.tsx` `error.tsx` `not-found.tsx`

### 4. Files to change
- `app/page.tsx`
- `app/globals.css`
- `utils/google-auth.ts`
- `utils/bigquery.ts`
- `TASKS.md`
- `docs/TASKS.md`
- `docs/PLANS.md`

### 5. Implementation idea
- `Google Cloud BigQuery` は server 側から REST API で query を実行する
- 認証は `metadata server` 優先、ローカルでは `gcloud auth application-default print-access-token` を fallback にする
- KPI は `reference_end_date` を基準に直近 7 日と前 7 日をまとめて表示する
- 改善候補は `page` entity を中心に、順位下落・伸びた記事・リライト候補を数件だけ出す

### 6. Risks
- Cloud Run 上の Web runtime identity に `BigQuery` 読み取り権限が足りない可能性がある
- 開発環境で `gcloud` 認証が切れていると画面取得が失敗する
- `BigQuery` query を毎回同期実行すると応答が遅くなる可能性がある

### 7. Validation
- `npm run build` が通る
- ログイン後トップページがダッシュボード表示になる
- `BigQuery` が読める環境では KPI と改善候補が表示される
- `BigQuery` が読めない環境でも画面が落ちずにエラーパネルで原因が見える

### 8. Result
- `app/page.tsx` を認証済みダッシュボードへ置き換え、KPI / 改善候補 / 上位ページを 1 画面で見られるようにした
- `utils/google-auth.ts` と `utils/bigquery.ts` を追加し、`Cloud Run` では `metadata server`、ローカルでは `gcloud` fallback で `BigQuery REST API` を読めるようにした
- `sql/bigquery/improvement_candidates_base.sql` の `previous-only` 行が二重化する欠陥を修正し、view を再適用した
- `seo-web-runtime` に `roles/bigquery.jobUser` と `roles/bigquery.dataViewer` を付与し、本番 `Cloud Run` から `BigQuery` を実行できる前提を整えた

### 9. 学習メモ
- 何をするか: `Cloud Run` の server component から `Google Cloud BigQuery` を直接読んで、MVP ダッシュボードに必要な集計値を返す
- なぜその GCP サービスを使うか: すでに raw / mart の正本が `BigQuery` にあるため、別 API や別 DB を作らずに最短で UI へつなげられる
- 代替案は何か: `@google-cloud/bigquery` client を入れる、独自 API route を挟む、または別テーブルへ再同期する
- 今回はなぜその案を選ぶか: 依存を増やさず `Cloud Run` と IAM の学習に集中でき、server component から直接読める構成が最も単純だった
- 実行コマンドの意味: `bq query` は mart/view の作成と検証、`gcloud projects add-iam-policy-binding` は `seo-web-runtime` に `BigQuery` 実行権限を追加する
- 次に確認するポイント: 本番 `Cloud Run` で BigQuery エラーが出ないか、14 日分たまった後に前週比較と順位下落カードが自然に埋まるか

### 10. 3点まとめ
- 変更内容: 認証済みトップを SEO ダッシュボードへ置き換え、`BigQuery` から KPI と改善候補を表示する MVP 画面を実装した
- 学習ポイント: `Cloud Run` から `BigQuery` を読むには、実行サービスアカウントへ `BigQuery Job User` と `BigQuery Data Viewer` を渡す必要がある
- 次にやること: `E4-T6 共通レイアウト実装` で画面全体の土台を固め、その後 `E4-T2 記事分析画面` へ進む

### 2026-03-09 E4-T6 共通レイアウト実装

### 1. Goal
認証済み画面を、`Looker Studio` 風の sidebar / topbar / canvas を持つ共通 shell に載せ替える。

### 2. Why
ダッシュボード単体だけ整っても、今後の記事分析やクエリ分析を増やしたときに画面ごとの見た目が散るため。先に共通 shell を置いておく方が UI の伸びしろが大きい。

### 3. Scope
- 認証済みルートを `app/(protected)` へ分離
- `app/(protected)/layout.tsx` で共通 sidebar / topbar を実装
- ダッシュボードを新しい shell に乗せ直す
- login 画面は独立したまま維持する

### 4. Result
- `app/(protected)/layout.tsx` を追加し、認証チェック・nav・operator card・logout を共通レイアウトへ移した
- `app/(protected)/page.tsx` へダッシュボード本体を移し、Looker Studio 風の scorecard / leaderboard / opportunity stack に再構成した
- `app/globals.css` を白基調の analytics UI へ更新し、左 sidebar とレポートキャンバスの見た目を統一した

### 5. Validation
- `npm run build` が通る
- `/login` は従来どおり独立表示のまま
- `/` は auth 必須の route group 内で表示される
- push 後に `Cloud Run` が新 revision に更新される

### 6. 3点まとめ
- 変更内容: 認証済み画面を `app/(protected)` に寄せ、Looker Studio 風の共通レイアウトを実装した
- 学習ポイント: App Router の route group を使うと、URL を変えずに login 系と管理画面系の layout を分離できる
- 次にやること: `E4-T2 記事分析画面` をこの shell 上に追加する

### 2026-03-09 E4-T2 記事分析画面

### 1. Goal
記事単位で、ページ一覧・前週比較・日次推移・流入クエリを見られる画面を `Looker Studio` 風 shell 上に追加する。

### 2. Why
ダッシュボードだけでは「どのページを直すか」は見えても、そのページの中身までは追い切れないため。記事分析画面で detail へ降りられるようにする必要がある。

### 3. Scope
- `/articles` route を追加
- 左 rail に記事一覧を置く
- 選択中ページの KPI、14 日推移、流入クエリを表示
- nav の active 状態を path ベースで切り替える
- 途中で見つかった mart 重複を補正する

### 4. Result
- `app/(protected)/articles/page.tsx` を追加し、記事一覧・KPI・日次 table・流入クエリ table を 1 画面へ実装した
- `utils/articles.ts` で page list / selected page trend / query breakdown を BigQuery から取得する query 群を追加した
- `components/studio-nav.tsx` を追加し、`usePathname()` で sidebar nav の active 状態を切り替えるようにした
- `sql/bigquery/page_daily.sql` と `sql/bigquery/query_daily.sql` に `QUALIFY ROW_NUMBER()` を入れ、複数 batch 実行による重複行を latest batch で dedupe するよう修正した
- `proxy.ts` で `x-pathname` / `x-search` を保護レイアウトへ渡し、未ログインで `/articles` に入ったときも login 後に元の path へ戻れるようにした

### 5. 学習メモ
- 何をするか: `Google Cloud BigQuery` の mart と raw を使い分けて、ページ detail と流入クエリ detail を server component で返す
- なぜその GCP サービスを使うか: page-level の集計正本は `seo_mart.page_daily`、page-query 粒度の正本は `seo_raw.raw_gsc` にあり、両方とも `BigQuery` で完結するため
- 代替案は何か: `page_query_daily` 専用 mart を別途追加する、あるいは detail API を別 service に切り出す
- 今回はなぜその案を選ぶか: MVP では query 数がまだ小さく、server component から raw を直接読む方が最短で、どの粒度をどこに置くかも学びやすい
- 実行コマンドの意味: `bq query` は mart/view の補正と実データ検証、`npx next typegen` は route group 変更後の型生成を更新する
- 次に確認するポイント: `/articles` で query breakdown が十分に埋まるか、今後 `page_query_daily` を mart 化した方がよい規模になるか

### 6. 3点まとめ
- 変更内容: `/articles` を追加し、記事一覧から 1 ページを選んで detail を見られる記事分析画面を実装した
- 学習ポイント: mart を作る前でも、`BigQuery raw` に latest batch dedupe を入れれば detail 画面の一次分析は十分作れる
- 次にやること: `E4-T3 クエリ分析画面` を追加し、page view と query view の往復を作る

### 2026-03-09 E4-T3 クエリ分析画面

### 1. Goal
クエリ単位で、一覧・前週比較・日次推移・紐づくページを見られる画面を `Looker Studio` 風 shell 上に追加する。

### 2. Why
記事分析だけでは「どの検索語が効いているか」「どのページに分散しているか」が見えにくいため。query view を足すことで page と query の往復を作る。

### 3. Scope
- `/queries` route を追加
- 左 rail にクエリ一覧を置く
- 選択クエリの KPI、14 日推移、紐づくページ一覧を表示
- sidebar nav に query view を追加
- 記事分析画面から query detail へ遷移できるようにする

### 4. Result
- `app/(protected)/queries/page.tsx` を追加し、クエリ一覧・KPI・日次 table・ページ分散 table を 1 画面へ実装した
- `utils/queries.ts` を追加し、`query_daily` を主ソース、`raw_gsc.page_query_daily` を補助ソースにした query detail query 群を追加した
- sidebar nav に `/queries` を追加し、記事分析画面の query table から query detail へ飛べるようにした

### 5. 学習メモ
- 何をするか: `Google Cloud BigQuery` の `query_daily` と `raw_gsc.page_query_daily` を組み合わせて、query 単位の detail を server component で返す
- なぜその GCP サービスを使うか: query 粒度の正本は `BigQuery` にあり、page distribution まで同じ保存先で追えるため
- 代替案は何か: query-detail 専用 mart を追加する、または API route で query 周りだけ別 service に切る
- 今回はなぜその案を選ぶか: MVP では `query_daily` と raw の組み合わせで十分に画面を作れ、raw と mart の役割差も学びやすい
- 実行コマンドの意味: `bq query` は query_daily の実データ確認、`npx next typegen` は `/queries` route 追加後の route 型を更新する
- 次に確認するポイント: page_count が 2 以上の query が溜まったときに page distribution がカニバリ候補の事前確認として使えるか

### 6. 3点まとめ
- 変更内容: `/queries` を追加し、query 一覧から 1 query を選んで detail を見られるクエリ分析画面を実装した
- 学習ポイント: `query_daily` は一覧用、`page_query_daily` raw は紐づくページ一覧用、と粒度で役割を分けると画面設計がしやすい
- 次にやること: `E4-T4 改善候補一覧画面` を追加し、dashboard の候補カードから一覧詳細へ広げる

### 2026-03-08 GitHub 起点デプロイ方針の追加

### 1. Goal
今後の運用を `ローカルで gcloud 実行` 中心から、`GitHub push -> GCP デプロイ` 中心へ切り替えられるようにタスク計画へ反映する。

### 2. Scope
- `TASKS.md` への `CI/CD` トラック追加
- 既存の GCP 学習ログは残したまま、今後の運用タスクを分離

### 3. Result
- `Epic 6. GitHub 連携デプロイ基盤` を追加
- 想定タスクを `E6-T1` から `E6-T6` まで整理
- `Current focus` は変えず、今の `E1-T8` を優先したまま backlog へ追加

### 4. Notes
- GitHub 起点に変えても、build 実行基盤は `Cloud Build`、実行基盤は `Cloud Run` を維持できる
- 代替案として `GitHub Actions` から直接 `gcloud` deploy する方法もある
- 学習目的と GCP 一貫性を考えると、まずは `Cloud Build Trigger` が第一候補

### 5. Next
- まずは `E1-T8` を閉じる
- その後 `E6-T2` で `Cloud Build Trigger` と `GitHub Actions` のどちらで行くか確定する

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

### 2026-03-09 E1-T8 本番 Google OAuth リダイレクト修正

### 1. Goal
`Cloud Run` 本番で Google OAuth が `0.0.0.0:8080` に戻ってしまう不具合を解消する。

### 2. Scope
- `/auth/login` の `redirect_to` 生成を公開 origin ベースへ修正
- `/auth/callback` と `/auth/signout` の absolute redirect を同じ helper に統一
- 原因と確認手順を学習メモとして残す

### 3. Result
- `utils/request-url.ts` を追加
- `x-forwarded-host` / `x-forwarded-proto` から公開 origin を組み立てるよう変更
- `curl` で `/auth/login` の `Location` が `https://seo-analyzer-web-n5hunzkyna-an.a.run.app/auth/callback?...` を含むことを確認できる状態にした

### 4. Notes
- `Cloud Run` では route handler の `request.url` が内部 origin `https://0.0.0.0:8080` になる場合がある
- OAuth の `redirect_to` をこの値で作ると、`Supabase Auth` は正しく動いてもブラウザが公開 URL に戻れない
- 代替案は `APP_URL` を Secret / env に固定する方法だが、今回は `Cloud Run` の proxy header を使う方が設定追加が少ない

### 5. Next
- ブラウザで Google ログインを再実行して、本番 `/queries` まで戻れるか確認する
- 問題なければ `E4-T4 改善候補一覧画面` に戻る

### 2026-03-09 E4 UIUX 改善

### 1. Goal
既存の MVP 3画面を、見た目だけでなく「何を先に見ればいいか」が分かる分析ツール寄りの UIUX に寄せる。

### 2. Scope
- `app/(protected)/layout.tsx` の topbar を route ごとに変える
- 各画面に jump links と highlight card を追加
- rail item / scorecard / table のスキャン性を上げる

### 3. Result
- 共通 shell に route context strip を追加し、今どの分析をしているかを topbar で伝えるようにした
- `dashboard/articles/queries` の header に highlight card と section jump を追加した
- rail に順位バッジ、scorecard と rail delta に tone、table に rank badge と zebra 背景を追加した

### 4. Notes
- 何をするか: 既存データ構造は変えずに、分析判断の順番が見える UI に寄せる
- なぜその GCP サービスを使うか: 今回は `Google Cloud BigQuery` の追加変更は不要で、server component が既存 query をそのまま利用できる
- 代替案は何か: Client Component で検索や並べ替えを厚く足す、または chart library を追加する
- 今回はなぜその案を選ぶか: MVP では dependency を増やさず、レイアウトと情報設計だけで使いやすさを上げる方が早い
- 実行コマンドの意味: `npm run build` で 3画面の server render と route 構成が壊れていないか確認した
- 次に確認するポイント: 実ブラウザで rail の読みやすさと mobile での section jump の使い勝手を確認する

### 5. 3点まとめ
- 変更内容: 分析ツールらしい context strip、jump links、highlight cards、順位バッジを追加した
- 学習ポイント: データを増やさなくても、「次に何を見るか」を UI で示すだけで分析画面の使いやすさは大きく上がる
- 次にやること: `E4-T4 改善候補一覧画面` を同じ UI 文脈で実装する

### 2026-03-09 E4-T4 改善候補一覧画面

### 1. Goal
ダッシュボードの改善候補カードを一覧詳細へ広げ、候補タイプ切替と深掘り導線を `Looker Studio` 風 shell 上で見られるようにする。

### 2. Scope
- `/opportunities` route を追加
- `伸びた記事 / 順位下落 / リライト候補 / カニバリ候補` の feed を切り替えられるようにする
- 選択候補の current_7d / previous_7d 比較を表示する
- sidebar nav と dashboard から新画面へ遷移できるようにする

### 3. Result
- `utils/opportunities.ts` を追加し、`improvement_candidates_base` を候補タイプ別に並べ替える query 群と summary 集計を実装した
- `app/(protected)/opportunities/page.tsx` を追加し、候補タイプ card、一覧 rail、選択候補の比較カード、記事分析/クエリ分析への導線を 1 画面にまとめた
- `app/(protected)/layout.tsx` に `/opportunities` を追加し、`app/(protected)/page.tsx` の候補カードから一覧画面へ遷移するように修正した

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `improvement_candidates_base` を server component から読んで、改善候補の一覧と詳細を返す
- なぜその GCP サービスを使うか: 改善候補の比較列の正本が `BigQuery` にあり、dashboard と同じ集計面をそのまま再利用できるため
- 代替案は何か: client 側で候補を組み立てる、または候補判定専用の API route / 追加 mart を作る
- 今回はなぜその案を選ぶか: MVP では `improvement_candidates_base` の再利用が最短で、`Epic 5` で判定ロジックを調整するときも query 条件の差し替えだけで済むため
- 実行コマンドの意味: `npx next typegen` は新しい `/opportunities` route の型を生成、`npm run build` は新 route と既存 shell の server render が壊れていないか確認する
- 次に確認するポイント: `E4-T5` で loading / error / not-found を route 単位で整え、空データ時の体験を画面間で揃える

### 5. 3点まとめ
- 変更内容: `BigQuery` の改善候補 view を元に、候補タイプ切替と深掘り導線を持つ `/opportunities` 画面を追加した
- 学習ポイント: `Google Cloud BigQuery` の共通比較 view を先に作っておくと、dashboard と一覧画面を別 route に広げても同じ query 面を再利用できる
- 次にやること: `E4-T5 loading / error / not-found 実装` に進み、各 route の待機・失敗時 UI を整える

### 2026-03-09 E4-T5 loading / error / not-found 実装

### 1. Goal
`Next.js App Router` の route segment ごとに待機中、失敗時、対象なしの表示をそろえ、画面遷移が途切れない状態にする。

### 2. Scope
- `app` 直下に `loading / error / global-error / not-found` を追加する
- `app/(protected)` に `loading / error / not-found` を追加する
- `articles / queries / opportunities` で無効な search param と存在しない対象を `notFound()` に寄せる
- 共通 shell と整合する skeleton / status UI を使う

### 3. Result
- `app/loading.tsx`、`app/error.tsx`、`app/global-error.tsx`、`app/not-found.tsx` を追加し、公開ルートと root layout 障害時の受け皿を分けた
- `app/(protected)/loading.tsx`、`app/(protected)/error.tsx`、`app/(protected)/not-found.tsx` を追加し、分析画面側の待機・失敗・対象なし表示を共通化した
- `app/(protected)/articles/page.tsx`、`app/(protected)/queries/page.tsx`、`app/(protected)/opportunities/page.tsx` で search param の不正値と存在しない選択対象を `notFound()` に統一した

### 4. Notes
- 何をするか: `Next.js App Router` の `route segment boundary` を埋めて、各画面が `loading / error / not-found` を明示的に返せるようにする
- なぜその方法を使うか: App Router は segment 単位で境界を持てるので、分析画面と公開画面で失敗時の文脈を分けやすいため
- 代替案は何か: 各 page 内で `if` 分岐だけで空状態と例外を吸収する、または 1 つの共通エラー画面だけに寄せる
- 今回はなぜその案を選ぶか: `notFound()` と `error.tsx` を route 境界に乗せた方が URL 不正、データ欠損、実例外を責務分離しやすく、MVP でも運用時の切り分けが速いため
- 実行コマンドの意味: `npx next typegen` は route 追加後の型更新、`npm run build` は `App Router` の本番 build と route 収集が壊れていないかの確認
- 次に確認するポイント: `Epic 5` で改善候補ロジックを正式化するとき、今回追加した `not-found` 導線が entity type の増減に追従できるかを見る

### 5. 3点まとめ
- 変更内容: `App Router` の公開ルートと保護ルートに `loading / error / not-found` を追加し、無効パラメータは `notFound()` に統一した
- 学習ポイント: `Next.js App Router` は `page` 内の条件分岐よりも、segment 境界を使った方が待機・例外・対象なしを自然に分けられる
- 次にやること: `Epic 5 改善候補ロジック` に入り、今の暫定条件を正式ルールへ切り出す

### 2026-03-09 E5-T1 順位下落ページ判定ルール

### 1. Goal
`順位下落` をノイズの多い暫定条件から外し、ダッシュボードと改善候補一覧で同じ page 判定ルールを使う。

### 2. Scope
- `順位下落` 用の判定条件を 1 か所へ集約する
- `dashboard` と `/opportunities` の `rank-drop` で同じ条件を使う
- ルールを `docs/data_source_contract.md` に明文化する

今回はやらないこと:
- `growth / rewrite / cannibal` の正式ルール化
- `BigQuery` view の列追加
- しきい値チューニング全体

### 3. Result
- `utils/opportunity-rank-drop.ts` を追加し、`rank-drop` の SQL 条件、並び順、説明文を 1 か所にまとめた
- `utils/dashboard.ts` と `utils/opportunities.ts` で同じ `rank-drop` 条件を使うようにして、ダッシュボードと一覧画面の候補差異をなくした
- `app/(protected)/opportunities/page.tsx` と `docs/data_source_contract.md` を更新し、画面上の説明と契約ドキュメントを実装条件に合わせた

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `improvement_candidates_base` を読む consumer 側で、順位下落候補の条件を共通化する
- なぜその GCP サービスを使うか: 判定に必要な比較列はすでに `BigQuery` view に揃っているため、追加集計を作らずに rule だけを差し替えられるため
- 代替案は何か: `BigQuery` view 自体に `is_rank_drop` 列を増やす、または Web 側で画面ごとに別条件を持つ
- 今回はなぜその案を選ぶか: `Epic 5` はまだ他ルールも続くので、まず consumer 側で共有条件を切り出した方が変更範囲が小さく、次タスクでも同じパターンを使い回しやすいため
- 実行コマンドの意味: `npx next typegen` は route 型の整合確認、`npm run build` は server component から共通 rule を参照しても本番 build が壊れないかの確認
- 次に確認するポイント: `E5-T2` で `growth` も同じ方式で rule 化し、`dashboard` と `/opportunities` の候補件数や上位順が自然かを見比べる

### 5. 3点まとめ
- 変更内容: `順位下落` を「順位悪化 + 実害あり」の page に絞る共通ルールへ更新し、ダッシュボードと改善候補一覧で共有した
- 学習ポイント: `Google Cloud BigQuery` の前段 view に比較列が揃っていれば、判定ルールは consumer 側の SQL 条件として段階的に固められる
- 次にやること: `E5-T2 伸びた記事判定ルール` を同じ形で共通化する

### 2026-03-09 E5-T2 伸びた記事判定ルール

### 1. Goal
`伸びた記事` を単純な増減判定から外し、意味のある成長シグナルだけをダッシュボードと改善候補一覧で共通表示する。

### 2. Scope
- `伸びた記事` 用の判定条件を 1 か所へ集約する
- `dashboard` と `/opportunities` の `growth` で同じ条件を使う
- ルールを `docs/data_source_contract.md` に明文化する

今回はやらないこと:
- `rewrite / cannibal` の正式ルール化
- `BigQuery` view の列追加
- しきい値チューニング全体

### 3. Result
- `utils/opportunity-growth.ts` を追加し、`growth` の SQL 条件、並び順、説明文を 1 か所にまとめた
- `utils/dashboard.ts` と `utils/opportunities.ts` で同じ `growth` 条件を使うようにして、ダッシュボードと一覧画面の候補差異をなくした
- `app/(protected)/opportunities/page.tsx` と `docs/data_source_contract.md` を更新し、画面上の説明と契約ドキュメントを実装条件に合わせた

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `improvement_candidates_base` を読む consumer 側で、伸びた記事候補の条件を共通化する
- なぜその GCP サービスを使うか: 判定に必要な比較列はすでに `BigQuery` view に揃っているため、追加集計なしで成長判定だけを差し替えられるため
- 代替案は何か: `BigQuery` view に `is_growth` 列を足す、または Web 側で画面ごとに別条件を持つ
- 今回はなぜその案を選ぶか: `Epic 5` の残りタスクでも同じ実装パターンを使いたく、まず consumer 側で共有条件を切り出した方が変更範囲を小さく保てるため
- 実行コマンドの意味: `npx next typegen` は route 型の整合確認、`npm run build` は server component から共通 rule を参照しても本番 build が壊れないかの確認
- 次に確認するポイント: `E5-T3` で `rewrite` も rule 化し、`growth` と `rewrite` の境界が被りすぎていないかを見る

### 5. 3点まとめ
- 変更内容: `伸びた記事` を「十分な表示母数があり、クリックまたは sessions が意味のある率と幅で伸び、順位改善または表示増もある page」に絞る共通ルールへ更新した
- 学習ポイント: `Google Cloud BigQuery` の共通比較 view があれば、増加判定も減少判定も consumer 側のルール差し替えだけで進められる
- 次にやること: `E5-T3 リライト候補判定ルール` を正式化する

### 2026-03-09 E5-T3 リライト候補判定ルール

### 1. Goal
`リライト候補` の条件を 1 か所へ集約し、露出はあるのに取り切れていない中位 page をダッシュボードと改善候補一覧で同じ基準で見られるようにする。

### 2. Scope
- `リライト候補` 用の判定条件を 1 か所へ集約する
- `dashboard` と `/opportunities` の `rewrite` で同じ条件を使う
- ルールを `docs/data_source_contract.md` に明文化する

今回はやらないこと:
- `BigQuery` view の列追加
- タイトル改善文面の自動提案
- CTR ベンチマークの高度化

### 3. Result
- `utils/opportunity-rewrite.ts` を追加し、`rewrite` の SQL 条件、並び順、説明文を 1 か所にまとめた
- `utils/dashboard.ts` と `utils/opportunities.ts` で同じ `rewrite` 条件を使うようにした
- `app/(protected)/opportunities/page.tsx` と `docs/data_source_contract.md` を更新し、画面上の説明と契約ドキュメントを実装条件に合わせた

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `improvement_candidates_base` を読む consumer 側で、リライト候補の条件を共通化する
- なぜその GCP サービスを使うか: 必要な `impressions / ctr / position` はすでに `BigQuery` view に揃っているため、追加 mart を作らずに判定条件だけを調整できるため
- 代替案は何か: `query` 分布や title 情報まで加えた専用 mart を作る
- 今回はなぜその案を選ぶか: MVP では中位ページの絞り込みを最短で安定させる方が重要で、深いリライト提案は次段階で十分なため
- 実行コマンドの意味: `npx next typegen` は route 型の整合確認、`npm run build` は server component から共通 rule を参照しても本番 build が壊れないかの確認
- 次に確認するポイント: `E5-T4` で `cannibal` を同じ方式で rule 化し、page 系候補と query 系候補の基準面を揃える

### 5. 3点まとめ
- 変更内容: `リライト候補` を「表示 80 以上、平均順位 6-20 位、CTR 12% 未満」の中位 page に絞る共通ルールへ更新した
- 学習ポイント: `Google Cloud BigQuery` の共通比較 view があれば、CTR ベースの候補抽出も consumer 側の条件切り出しだけで統一できる
- 次にやること: `E5-T4 カニバリ候補判定ルール` を正式化する

### 2026-03-09 E5-T4 カニバリ候補判定ルール

### 1. Goal
`カニバリ候補` の条件を 1 か所へ集約し、複数 page に分散している意味のある query だけを改善候補一覧で安定して見られるようにする。

### 2. Scope
- `カニバリ候補` 用の判定条件を 1 か所へ集約する
- `/opportunities` の `cannibal` で同じ条件を使う
- ルールを `docs/data_source_contract.md` に明文化する

今回はやらないこと:
- ダッシュボードへの `cannibal` card 追加
- query intent の自動クラスタリング
- canonical page の自動確定

### 3. Result
- `utils/opportunity-cannibal.ts` を追加し、`cannibal` の SQL 条件、並び順、説明文を 1 か所にまとめた
- `utils/opportunities.ts` と `app/(protected)/opportunities/page.tsx` で同じ `cannibal` 条件を使うようにした
- `docs/data_source_contract.md` を更新し、query 系ルールを契約ドキュメントに追加した

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `improvement_candidates_base` を読む consumer 側で、カニバリ候補 query の条件を共通化する
- なぜその GCP サービスを使うか: `support_count / impressions / position` がすでに `BigQuery` view にあるため、query 専用の追加集計なしで判定を固められるため
- 代替案は何か: page-query raw から query ごとの分散指標を別 mart で再計算する
- 今回はなぜその案を選ぶか: MVP では `support_count` ベースの単純な分散判定で十分で、専用 mart は後からでも追加できるため
- 実行コマンドの意味: `npx next typegen` は route 型の整合確認、`npm run build` は server component から共通 rule を参照しても本番 build が壊れないかの確認
- 次に確認するポイント: `E5-T5` で 4 つのルール全体を見直し、役割分担と重なり方を文章化する

### 5. 3点まとめ
- 変更内容: `カニバリ候補` を「2 ページ以上に分散し、表示 80 以上かつ平均順位 20 位以内」の query に絞る共通ルールへ更新した
- 学習ポイント: `Google Cloud BigQuery` の共通比較 view に `support_count` があれば、query 分散の初期判定も consumer 側だけで実装できる
- 次にやること: `E5-T5 MVP用のしきい値調整` として、4 ルールの役割分担を整理する

### 2026-03-09 E5-T5 MVP用のしきい値調整

### 1. Goal
4 つの改善候補ルールを MVP の既定閾値セットとして整理し、役割分担と重なり方を明文化する。

### 2. Scope
- `rank_drop / growth / rewrite / cannibal` の閾値を一覧で整理する
- ルール間の役割分担を明文化する
- 重なりを許容する箇所を明記する

今回はやらないこと:
- 実データを見たしきい値再学習
- 本番ログを使った AB 比較
- UI 側の候補統合ロジック

### 3. Result
- `docs/data_source_contract.md` に `mvp_opportunity_threshold_policy` を追加し、4 ルールの役割分担を整理した
- `rank_drop / growth` は 20 位以内の page を主戦場にしつつ、`rewrite` は 6-20 位の CTR 問題、`cannibal` は query 分散に寄せる方針を明文化した
- `growth` と `rewrite` の重なりは MVP では許容する方針を明記した

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の比較 view を使う 4 ルールの閾値セットを、MVP の既定値として整理する
- なぜその GCP サービスを使うか: 4 ルールとも `BigQuery` の同じ前段 view を参照しているため、閾値の役割分担も同じ契約ドキュメントにまとめやすいため
- 代替案は何か: 各 helper ファイルだけを正本にして docs を持たない
- 今回はなぜその案を選ぶか: 学習目的の案件なので、どの閾値がどの役割を持つかを文章で残した方が後から調整しやすいため
- 実行コマンドの意味: 今回の調整は docs 反映が中心で、build 済みの helper 群を前提に閾値ポリシーを整理した
- 次に確認するポイント: 実データを見たときに `growth` と `rewrite` の重なりが多すぎないか、`cannibal` 件数が少なすぎないかを確認する

### 5. 3点まとめ
- 変更内容: 4 つの改善候補ルールを MVP 用の既定閾値セットとして整理し、役割分担と重なりを明文化した
- 学習ポイント: `Google Cloud BigQuery` の共通比較 view を土台にすると、複数ルールの閾値設計も同じ比較列を基準に揃えやすい
- 次にやること: 実データで候補件数と重なりを確認し、必要なら閾値を微調整する

### 2026-03-09 実データ確認と比較不足時表示の調整

### 1. Goal
`BigQuery` 上の実データで候補件数を確認し、候補ゼロが閾値の問題か比較期間不足かを切り分ける。

### 2. Scope
- `improvement_candidates_base` の実件数とルール重なりを確認する
- 前週比較列の有無を確認する
- 比較期間不足のときに UI が誤解を生まないようにする

### 3. Result
- `BigQuery` 直クエリで `reference_end_date = 2026-03-05`、`page` の前週比較列が `0` 行であることを確認した
- 現在の候補件数は `rewrite 1件 / growth 0件 / rank-drop 0件 / cannibal 0件` で、ゼロの主因は閾値ではなく比較期間不足だと分かった
- `utils/opportunities.ts` に `comparisonReady` を追加し、`app/(protected)/opportunities/page.tsx` と `app/(protected)/page.tsx` で「候補なし」ではなく「前週比較データ蓄積中」を表示するようにした

### 4. Notes
- 何をするか: `Google Cloud BigQuery` に直接 query を投げ、候補件数と前週比較列の有無を確認する
- なぜその GCP サービスを使うか: 判定の正本は `BigQuery` の `improvement_candidates_base` にあるため、UI ではなくデータ面を直接見た方が原因を切り分けやすいため
- 代替案は何か: ブラウザ画面だけを見てゼロ件の理由を推測する
- 今回はなぜその案を選ぶか: ルールが厳しすぎるのか、単に前週データがないのかは `BigQuery` を直接見ないと判断できないため
- 実行コマンドの意味: `bq query --use_legacy_sql=false` で `improvement_candidates_base` を直接確認し、件数・重なり・前週比較列の有無を取得した
- 次に確認するポイント: `2026-03-16` 前後に前週比較が入り始めたら、`growth / rank-drop / cannibal` の件数が自然に立つかを確認する

### 5. 3点まとめ
- 変更内容: 実データ確認で比較期間不足を特定し、比較不足時の UI 表示を蓄積中メッセージへ修正した
- 学習ポイント: `Google Cloud BigQuery` の比較 view は、UI の不具合切り分けにも使える運用上の正本になる
- 次にやること: 前週データがたまった後に候補件数を再確認し、必要なら閾値を微調整する

### 2026-03-09 比較 ready 見込み日の表示

### 1. Goal
比較不足を単に「蓄積中」と出すだけでなく、いつ前週比較が揃う見込みかまで画面で分かるようにする。

### 2. Scope
- `page_daily` の `active_days` と `latest_date` から ready 見込み日を計算する
- ダッシュボードと改善候補一覧で同じ表示ロジックを使う
- 比較不足時の空状態メッセージにも見込み日を含める

今回はやらないこと:
- `BigQuery` の追加検証クエリ
- 閾値自体の再調整
- batch 実行設定の変更

### 3. Result
- `utils/comparison-window.ts` を追加し、`14日比較 window` の進捗と見込み日を共通計算するようにした
- `utils/opportunities.ts` は `page_daily` 由来の `page_active_days` と `page_latest_date` を返すように更新した
- `app/(protected)/page.tsx` と `app/(protected)/opportunities/page.tsx` で `蓄積中 x/14日 -> 最短 日付` を表示し、空状態にも同じ見込み日を反映した

### 4. Notes
- 何をするか: `Google Cloud BigQuery` の `page_daily` にある日数情報から、前週比較 ready の見込み日を UI に出す
- なぜその GCP サービスを使うか: 比較期間の進捗は `BigQuery` の集計済み日付が正本なので、画面側で推測するより確実なため
- 代替案は何か: 固定文言のままにする、または手計算で日付を docs にだけ書く
- 今回はなぜその案を選ぶか: UI 上でその場に見込み日が出た方が、ゼロ件を誤解せず次の確認タイミングも判断しやすいため
- 実行コマンドの意味: `npx next typegen` は route 型整合の確認、`npm run build` は `BigQuery` 由来の追加列と共通 helper を含めても本番 build が通るかの確認
- 次に確認するポイント: `2026-03-16` 前後に `growth / rank-drop` が自然に立ち始めるか、ETA 表示どおりに比較 ready へ切り替わるかを確認する

### 5. 3点まとめ
- 変更内容: 比較不足時に、蓄積状況だけでなく前週比較 ready の見込み日も画面に表示するようにした
- 学習ポイント: `Google Cloud BigQuery` の `active_days` のような運用メタ情報も、分析 UI の説明責任にそのまま使える
- 次にやること: `2026-03-16` 前後に実データを再確認し、候補件数と閾値の再調整要否を判断する

### 2026-03-09 data:readiness 監視 script 追加

### 1. Goal
`BigQuery` の蓄積状況と前週比較 ready 状態を、手作業 query なしで 1 コマンドで確認できるようにする。

### 2. Scope
- `raw_gsc` と `raw_ga4` の最新日付と件数を確認する
- `page_daily` の `active_days` と `improvement_candidates_base` の前週比較 ready 状態を確認する
- `npm script` から JSON でも読めるようにする

今回はやらないこと:
- `Cloud Scheduler` への通知連携
- 監視専用 UI route の追加
- 候補件数の閾値再調整

### 3. Result
- `scripts/lib/bigquery-client.mjs` に query 実行 helper を追加した
- `scripts/data-readiness-check.mjs` と `npm run data:readiness` を追加し、raw / mart / comparison の要点をまとめて返すようにした
- 実データ実行では `reference_end_date = 2026-03-05`、`page_daily_active_days = 3/14`、`candidate_page_previous_rows = 0` で、最短 ETA は `2026-03-16` と確認できた

### 4. Notes
- 何をするか: `Google Cloud BigQuery` に対して raw と mart の鮮度確認 query をまとめて実行する script を追加する
- なぜその GCP サービスを使うか: 前週比較 ready の正本は `BigQuery` の `page_daily` と `improvement_candidates_base` にあり、画面より先にデータ面を確認できるため
- 代替案は何か: 毎回 `bq query` を手で打つ、またはブラウザ画面だけで確認する
- 今回はなぜその案を選ぶか: 再確認タイミングが何度も来るので、1 コマンド化した方が運用しやすく誤読も減るため
- 実行コマンドの意味: `npm run data:readiness -- --json` は raw と mart の鮮度、比較 window 進捗、ETA を JSON で返す。`npm run build` は script 追加後も Web 側の本番 build が壊れていないかの確認
- 次に確認するポイント: `2026-03-16` 前後に `npm run data:readiness` を再実行し、`status = ready` へ変わるかを確認する

### 5. 3点まとめ
- 変更内容: `BigQuery` の蓄積状況と前週比較 ready 状態を確認する `data:readiness` script を追加した
- 学習ポイント: `Google Cloud BigQuery` は分析表示だけでなく、raw / mart /比較 window の運用監視にもそのまま使える
- 次にやること: `2026-03-16` 前後に `npm run data:readiness` を再実行し、候補件数と閾値再調整の要否を判断する

### 2026-03-09 Epic 7 Hardening の起票

### 1. Goal
MVP 完了後の残リスクを task に落とし、owner only 制御、設定化、品質ゲートを次フェーズとして明確にする。

### 2. Scope
- owner only 制御の gap を閉じる
- サイト固有設定と threshold を config/env へ外出しする
- `GitHub Actions` の pre-deploy quality gate を追加する
- `data:readiness` は blocking CI ではなく scheduled / informational 監視として整理する

今回はやらないこと:
- `Cloud Run` を IAM 認証必須に切り替える
- `BigQuery` の参照構造を全面的に作り直す
- 画面の大規模 redesign

### 3. Result
- `TASKS.md` と `docs/TASKS.md` に `Epic 7. Hardening` を追加した
- `owner only`, config, quality gate, test, deploy gate, readiness monitoring を 6 task に分解した
- project status は `MVP 完了` と `Hardening backlog` を分けて読める形に更新した

### 4. Notes
- 何をするか: `Supabase Auth`, `GitHub Actions`, `Google Cloud Run` 周辺の残リスクを、次に実装すべき task へ分解する
- なぜその GCP サービスを使うか: deploy の品質ゲートは `GitHub Actions` が入口であり、実行基盤は `Google Cloud Run` のまま保つ方がブラウザアプリとの整合が取りやすいため
- 代替案は何か: `Cloud Run` を認証必須にする、または hardening を docs にだけ残して後回しにする
- 今回はなぜその案を選ぶか: `Cloud Run` の IAM 認証は Web アプリ用途では扱いづらく、本丸はアプリ / `Supabase` 側の owner 制御と `GitHub Actions` の品質ゲートのため
- 実行コマンドの意味: 今回は docs 更新のみ。実装時は `npm run lint`、`npm run typecheck`、test script、check workflow を基準にする予定
- 次に確認するポイント: `E7-T1` で許可メールと `profiles.role` を code / `Supabase` の両面でどこまで強制するかを先に決める

### 5. 3点まとめ
- 変更内容: `Hardening` を新しい epic として起票し、owner only 制御、設定化、品質ゲートを次フェーズに切り出した
- 学習ポイント: `Google Cloud Run` の公開 / 非公開だけでは owner only は保証できず、`Supabase Auth` と `GitHub Actions` の境界で責任を分ける方が実装しやすい
- 次にやること: `E7-T1` から着手し、許可メール固定と `profiles.role` を最優先で実装する

### 2026-03-09 E7-T1 owner only 制御

### 1. Goal
自分専用管理画面の保証を、`ログイン済みかどうか` だけでなく、固定 owner メールと `profiles.role` の両方で強制する。

### 2. Scope
- `Next.js` 側で `owner email + profiles.role = owner` の二段チェックを入れる
- unauthorized session を残さずに sign out させる
- `Supabase` 側に `profiles.role`、owner backfill、self-escalation 防止を入れる

今回はやらないこと:
- `Cloud Run` を IAM 認証必須へ切り替える
- owner メールや site 設定の env/config 化
- `GitHub Actions` の quality gate 追加

### 3. Result
- `utils/owner-access.ts` を追加し、固定 owner メール `fwns6760@gmail.com` と `profiles.role = owner` を共通判定するようにした
- `app/(protected)/layout.tsx`、`app/login/page.tsx`、`app/auth/callback/route.ts` で owner 判定を必須化し、unauthorized user は `/auth/unauthorized` へ送り sign out 後に `/login` へ戻すようにした
- `Supabase` には migration `add_profiles_role_owner_guard` を適用し、`public.profiles.role`、owner backfill、`handle_new_user` の owner 付与、`prevent_profile_role_change` trigger、insert policy の `viewer` 固定を追加した

### 4. Notes
- 何をするか: `Supabase Auth` でログインした user が、本当に owner かを app と DB の両方で確認する
- なぜそのサービスを使うか: owner 制御の正本は `Supabase Auth` の user と `public.profiles` にあり、`Cloud Run` の公開設定だけでは owner 限定を保証できないため
- 代替案は何か: app 側で email だけを見る、または `Cloud Run` を非公開化して Google Cloud IAM に寄せる
- 今回はなぜその案を選ぶか: browser アプリでは `Cloud Run` の IAM 認証は扱いづらく、`Supabase` に role を持たせて app と DB の両方で確認する方が実装と運用の筋がよいため
- 実行コマンドの意味: `npx next typegen` は route 型整合の確認、`npm run build` は owner 判定 route 追加後も本番 build が通るかの確認、`Supabase advisor` は schema 変更後の security warning 確認
- 次に確認するポイント: `E7-T2` で `Supabase Dashboard` 側の Auth 設定と運用手順を整理し、owner 以外 user の扱いを docs でも固定する

### 5. 3点まとめ
- 変更内容: 固定 owner メールと `profiles.role` を併用した owner only 制御を app / `Supabase` の両面に追加した
- 学習ポイント: `Supabase Auth` の session 制御だけでは owner 限定は足りず、`public.profiles` の role と self-escalation 防止まで入れて初めて実装として閉じる
- 次にやること: `E7-T2` で `Supabase` 側の運用整理を進め、その後 `E7-T3` の config/env 化へ進む

### 2026-03-09 E7-T2 Supabase 側 owner 制限整理

### 1. Goal
owner 以外 user の作成自体を `Supabase Auth` 側でもできるだけ早く止め、OAuth / profile / 運用手順を docs まで含めて揃える。

### 2. Scope
- `before-user-created` hook 用の SQL 関数を追加する
- Google OAuth 開始時に owner アカウントを選びやすくする
- `Supabase Dashboard` で hook を有効化する手順を docs に残す

今回はやらないこと:
- hook の dashboard 設定を API で自動化する
- owner メール固定値の config/env 化
- `GitHub Actions` での quality gate 追加

### 3. Result
- `Supabase` には migration `add_owner_signup_hook` を適用し、`public.hook_restrict_owner_signup(event jsonb)` を追加した
- `app/auth/login/route.ts` では `signInWithOAuth` に `login_hint = fwns6760@gmail.com` と `prompt = select_account` を追加した
- `docs/supabase_owner_only_setup.md` を追加し、`Before user created` hook を `public.hook_restrict_owner_signup` に紐付ける dashboard 手順と確認ポイントを整理した

### 4. Notes
- 何をするか: `Supabase Auth` の `before-user-created` hook を使い、owner メール以外の signup を `403` で拒否する
- なぜそのサービスを使うか: app 側で弾くだけだと auth user 自体は作れてしまうため、`Supabase Auth` の user 作成タイミングで止めた方が owner only の責務分担が明確になるため
- 代替案は何か: app 側の role/email check だけに頼る、または dashboard 手順だけ残して SQL hook を作らない
- 今回はなぜその案を選ぶか: `before-user-created` hook は `Supabase` が公式に用意している signup 制御の入口で、固定 owner メールの案件には最短で合うため
- 実行コマンドの意味: SQL では `public.hook_restrict_owner_signup('{\"user\":{\"email\":\"...\"}}'::jsonb)` を実行して owner / non-owner の戻り値を確認した。`npm run build` は OAuth route の `queryParams` 追加後も本番 build が通るかの確認
- 次に確認するポイント: `Supabase Dashboard` で `Before user created` hook を有効化し、owner 以外の Google アカウントで実際に signup が拒否されることを確認する

### 5. 3点まとめ
- 変更内容: `Supabase Auth` の signup 入口に owner メール制限の SQL hook を追加し、hook 有効化手順も docs に残した
- 学習ポイント: owner only 制御は app 画面だけでなく、`Supabase Auth` の user 作成段階で止めると無駄な auth user を減らせる
- 次にやること: `E7-T3` で固定値を config/env へ外出しし、owner メールや project/dataset/threshold の再利用性を上げる

### 2026-03-09 E7-T3 サイト固有設定と threshold の config/env 化

### 1. Goal
`yoshilover.com`、`baseballsite`、固定 owner メール、opportunity 閾値の直書きを app / scripts / workflow から外し、既定値は保ちつつ再利用しやすい設定面へ寄せる。

### 2. Scope
- site 名、domain、origin、owner email、`BigQuery` project / dataset / location を共通 config に寄せる
- opportunity 判定閾値を 4 helper から切り離し、config + env override にする
- `Cloud Run` / `Cloud Run Jobs` deploy workflow も config 変更を拾い、必要な runtime env を渡す

今回はやらないこと:
- `Supabase` SQL hook の owner メールを env から直接参照する
- service account 名や `PROJECT_ID` を GitHub variables に移す
- threshold の UI 編集画面を作る

### 3. Result
- `config/runtime-defaults.json` を追加し、site / owner / `BigQuery` / opportunity の既定値を 1 か所へ集約した
- `utils/runtime-config.ts` と `scripts/lib/runtime-config.mjs` を追加し、app 側と batch/readiness script 側の両方で env override を共通解釈するようにした
- `app/layout.tsx`、`app/(protected)/layout.tsx`、`utils/owner-access.ts`、`utils/bigquery.ts`、`utils/articles.ts`、`utils/queries.ts`、`utils/dashboard.ts`、`utils/opportunities.ts`、各 opportunity helper、`scripts/lib/gsc-client.mjs`、`scripts/lib/ga4-client.mjs`、`scripts/seo-batch-job.mjs`、`scripts/data-readiness-check.mjs` を config 参照へ置き換えた
- `.env.example` と `README.md` に env 一覧と既定値ファイルの場所を追記し、workflow では `config/**` 変更時も deploy が走るよう path filter を追加した

### 4. Notes
- 何をするか: app / batch / readiness script / deploy workflow がそれぞれ持っていた site 固定値と threshold を、共通 config と env override で読むように揃える
- なぜその GCP サービスを使うか: 本番の runtime 設定は `Google Cloud Run` と `Google Cloud Run Jobs` の env に乗るため、code の固定値を減らしても deploy 先へ値を明示的に渡せる
- 代替案は何か: code 内の定数だけ整理して env 化しない、または GitHub / `Cloud Run` 側の variables 管理へ一気に寄せる
- 今回はなぜその案を選ぶか: まずは repo 内の重複固定値を消すのが先で、既定値ファイル + env override にすると local と本番の両方を壊さずに段階移行できるため
- 実行コマンドの意味: `npx next typegen` は config import 追加後の route 型整合確認、`node --check scripts/seo-batch-job.mjs` と `node --check scripts/data-readiness-check.mjs` は JSON import を含む script 構文確認、`npm run build` は app / workflow 向け config 差し替え後も本番 build が通るかの確認
- 次に確認するポイント: `E7-T4` で `lint` / `typecheck` / `build` を正式 script 化し、deploy 前に最低限の check を必須化する

### 5. 3点まとめ
- 変更内容: site / owner / `BigQuery` / threshold の直書きを共通 config と env override へ寄せ、app / scripts / workflow で同じ設定面を使うようにした
- 学習ポイント: `Google Cloud Run` と `Cloud Run Jobs` は code の固定値を減らしても runtime env を渡せるので、最初に「既定値」と「環境差分」の責務を分けると後から整理しやすい
- 次にやること: `E7-T4` で quality check script を追加し、`GitHub Actions` の deploy 前段に置ける形へ進める

### 2026-03-09 E7-T4 quality check 追加

### 1. Goal
最低限の品質ゲートとして `lint`、`typecheck`、`build` をローカル command に揃え、次の `deploy 前 check` 実装でそのまま再利用できる状態にする。

### 2. Scope
- `eslint` と `eslint-config-next` を追加する
- `npm run lint`、`npm run typecheck`、`npm run check` を追加する
- 現在の codebase が新しい check を通るよう、必要な最小修正だけ入れる

今回はやらないこと:
- `GitHub Actions` に check workflow をまだ追加しない
- test runner や smoke test を追加しない
- `data:readiness` を blocking gate にしない

### 3. Result
- `eslint.config.mjs` を追加し、`eslint-config-next/core-web-vitals` ベースの lint を有効化した
- `package.json` に `lint`、`typecheck`、`check` script を追加した
- `README.md` に `npm run lint`、`npm run typecheck`、`npm run check` を追記した
- `tsconfig.json` では `.next/dev/types/**/*.ts` を外し、`typecheck` が stale な dev 生成物で落ちないようにした

### 4. Notes
- 何をするか: `Next.js` / `TypeScript` 案件で最低限ほしい `lint -> typecheck -> build` を、手元でも CI でも同じ command で呼べるようにする
- なぜその GCP サービスを使うか: 今回の変更自体は GCP を直接触らないが、次の `GitHub Actions` pre-deploy gate は最終的に `Google Cloud Run` deploy の前段へ置くため、先に command 面を固定しておく
- 代替案は何か: `build` だけを品質ゲートとみなす、または lint を入れず `tsc --noEmit` のみにする
- 今回はなぜその案を選ぶか: `build` だけでは code smell や framework rule を拾いきれず、`eslint-config-next` を足しても実装コストはまだ小さいため
- 実行コマンドの意味: `npm run lint` は `Next.js` / React ルール確認、`npm run typecheck` は `tsc --noEmit` で型整合確認、`npm run check` は deploy 前の手元一括確認。`tsconfig` から `.next/dev/types` を外したのは dev server 由来の stale file を quality gate の正本にしないため
- 次に確認するポイント: `E7-T5` で最小 test / smoke test を追加し、`E7-T6` で `npm run check` を deploy workflow の前段へ置く

### 5. 3点まとめ
- 変更内容: `eslint`、`typecheck`、`build` を `npm run check` で一括実行できるようにした
- 学習ポイント: deploy 前 gate は最初に「workflow を作る」より先に、「ローカルでも再利用できる単一 command」を作ると後の CI 組み込みが楽になる
- 次にやること: `E7-T5` で最小 test / smoke test を追加する

### 2026-03-09 E7-T5 最小 test / smoke test 追加

### 1. Goal
最小限でも壊れやすい helper と runtime config を自動確認できるようにし、`deploy 前 check` に繋げるための test 面を追加する。

### 2. Scope
- 追加依存なしで動く `node:test` を使う
- pure helper と runtime config に unit / smoke test を足す
- `npm test` と `npm run test:smoke` を追加する

今回はやらないこと:
- Playwright や E2E browser test を入れない
- BigQuery / Supabase へ実接続する integration test を入れない
- deploy workflow にまだ組み込まない

### 3. Result
- `package.json` に `test:unit`、`test:smoke`、`test` script を追加した
- `tests/unit-comparison-window.test.mjs` で 14 日比較 window の ready / eta 計算を検証した
- `tests/unit-request-url.test.mjs` で local / forwarded header の public URL 解決を検証した
- `tests/smoke-runtime-config.test.mjs` で runtime config の既定値と env override、`pickSite` の選択ロジックを検証した
- `tsconfig.json` は `.next/dev/**/*` を exclude し、test 追加後も `typecheck` が dev server 生成物で不安定にならないよう整理した

### 4. Notes
- 何をするか: database や OAuth を直接叩かなくても、比較 window、公開 URL、site / BigQuery 設定のような事故りやすい基礎ロジックを自動検証する
- なぜその GCP サービスを使うか: 今回は GCP を直接叩かないが、次の `GitHub Actions` deploy gate で `Google Cloud Run` 反映前に安全確認を入れるため、その前提となる test command を整えている
- 代替案は何か: すぐに Playwright を入れる、または test は後回しで workflow だけ先に作る
- 今回はなぜその案を選ぶか: まずは追加依存なしで回る `node:test` の方が軽く、pure helper の regressions を短時間で拾えるため
- 実行コマンドの意味: `npm test` は unit + smoke の一括確認、`npm run test:smoke` は runtime config と site selection の軽い確認。`tsconfig` から `.next/dev` を除いたのは、test 導入後も `tsc --noEmit` が dev session 状態に引きずられないようにするため
- 次に確認するポイント: `E7-T6` で `npm run check` と `npm test` を `GitHub Actions` の deploy 前段へ入れ、`data:readiness` は scheduled / informational に分けて扱う

### 5. 3点まとめ
- 変更内容: `node:test` ベースの unit / smoke test と `npm test` command を追加した
- 学習ポイント: browser E2E を入れる前でも、pure helper と runtime config を押さえるだけで hardening の価値は十分出る
- 次にやること: `E7-T6` で deploy 前 check と readiness 監視の workflow を整理する

### 2026-03-09 E7-T6 deploy 前 check 必須化と data:readiness の定期監視整理

### 1. Goal
`npm run check` と `npm test` を `GitHub Actions` の deploy 前段へ組み込み、`data:readiness` は deploy blocker から切り離して scheduled monitoring に整理する。

### 2. Scope
- reusable な quality workflow を追加する
- `deploy-web` / `deploy-job` の前段に quality workflow を必須化する
- `data:readiness` を manual + scheduled workflow に分け、summary と artifact を残す

今回はやらないこと:
- readiness が `collecting` の間に workflow を fail させない
- Slack / email 通知を追加しない
- readiness 用の専用 Service Account を新設しない

### 3. Result
- `.github/workflows/quality-check.yml` を追加し、`pull_request` / `workflow_dispatch` / `workflow_call` で `lint`、`typecheck`、`test`、`build` を実行する reusable workflow にした
- `.github/workflows/deploy-web.yml` と `.github/workflows/deploy-job.yml` は `quality-check` job を先に呼び、`needs` で deploy を待つ形に更新した
- `.github/workflows/data-readiness-monitor.yml` を追加し、毎日 `21:30 UTC` (`06:30 JST`) と manual run で `node scripts/data-readiness-check.mjs --json` を実行し、`readiness-summary.json` を artifact と job summary に残すようにした

### 4. Notes
- 何をするか: deploy の入口で code 品質を止め、`data:readiness` は「本番データがまだ 14 日たまっていない」だけで deploy を止めないよう責務を分ける
- なぜその GCP サービスを使うか: readiness の正本は `BigQuery` にあり、`GitHub Actions` から `Workload Identity Federation` で `Google Cloud` 認証すれば、長期鍵なしで定期確認できるため
- 代替案は何か: deploy workflow の中で `data:readiness` まで実行して blocker にする、または readiness を手元コマンドだけに残す
- 今回はなぜその案を選ぶか: readiness はコード品質ではなくデータ成熟度なので、deploy gate と分けた方が誤検知で本番反映を止めずに済むため
- 実行コマンドの意味: reusable `Quality Check` は `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` を順に実行する。`Data Readiness Monitor` は `node scripts/data-readiness-check.mjs --json` を実行し、結果を `GITHUB_STEP_SUMMARY` と artifact へ保存する
- 次に確認するポイント: GitHub Actions 上で `Data Readiness Monitor` を 1 回手動実行し、`seo-web-deployer` に `BigQuery` 読み取り権限が足りるかを確認する。足りなければ `roles/bigquery.jobUser` / `roles/bigquery.dataViewer` を付与するか、専用読み取り SA へ切り替える

### 5. 3点まとめ
- 変更内容: deploy 前 quality gate を workflow 化し、`data:readiness` を scheduled monitoring へ分離した
- 学習ポイント: `Google Cloud BigQuery` の readiness 確認は deploy blocker にせず、`GitHub Actions` の別 workflow で観測する方が実運用で扱いやすい
- 次にやること: `Data Readiness Monitor` を GitHub Actions で手動実行して、IAM と summary 出力を確認する
