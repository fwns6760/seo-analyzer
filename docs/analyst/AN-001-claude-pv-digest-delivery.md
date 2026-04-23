# AN-001 Claude PV Digest Delivery

- status: READY
- owner: Claude analyst
- depends_on: `071` implemented contract (`docs/claude_analyst_pv_digest_contract.md`)

## Why now

`071` で digest JSON と human-readable dry-run は実装済みになった。次に足りないのは、朝レポート本文を user に届ける delivery だけ。

## Purpose

Claude analyst が `npm run analyst:digest -- --format json` を読んで作った朝レポート本文を、実際のメール delivery に接続できるようにする。

## Scope

- digest JSON を入力にした analyst mail body renderer を固定する
- 送信 subject / recipient / cadence の contract を固定する
- handoff なしでも dry-run と本送信を切り替えられるようにする
- 初期 cadence は毎朝 8:00 JST とする

## Success criteria

- digest JSON から analyst 朝メール本文を安定して生成できる
- `収益: 未接続` と `X寄与: 未接続` を本文に明示できる
- `next_action` は 1 件に絞られる
- dry-run と本送信の境界が明確

## Non-goals

- X API 連携
- AdSense / 収益 API 連携
- dashboard 改修
- `wordpressyoshilover` 側の実装

## Acceptance check

- mail body fixture test がある
- digest 未蓄積時は `蓄積中` を返せる
- `071` の JSON contract を壊さない
- build / infrastructure ticket に diff を混ぜない
