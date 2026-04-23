# AN-003 Revenue Input Bridge

- status: PARKED
- owner: Claude analyst
- depends_on: AN-001 optional

## Why now

現状の digest は PV / 流入 / 回遊までで、収益は `revenue: null` のまま。AdSense などの本 API 連携を急がず、まずは手入力または CSV から revenue summary を analyst に橋渡しする。

## Purpose

収益を analyst digest に無理なく載せる最小 bridge を作り、PV と revenue の距離を同じレポートで見られるようにする。

## Scope

- CSV または手入力 revenue summary の contract を固定する
- 日付 / 収益 / ページまたはチャネル粒度の最小列を定義する
- digest JSON に `revenue` を載せるための shape を定義する
- fixture で dry-run できるようにする

## Success criteria

- analyst が `収益: 未接続` から `収益 summary` へ段階的に移れる
- API 連携なしで開始できる
- PV digest と revenue digest の粒度差が明文化されている

## Non-goals

- AdSense API 直接連携
- 課金 / 請求の自動同期
- 財務ダッシュボード化
- X 寄与の推定

## Acceptance check

- revenue input contract が markdown で明文化されている
- fixture から digest-ready shape を作れる
- 未投入時は `収益: 未接続` を維持できる
