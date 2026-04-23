# Analyst Tickets

`seo-analyzer` の analyst 系 ticket はこのディレクトリだけで管理する。

- server / build / product 本線の履歴は既存の `docs/TASKS.md` と `docs/PLANS.md` に残す
- `wordpressyoshilover` 側の 0xx 運用 ticket とは混ぜない
- analyst ticket の命名は `AN-###-slug.md` に固定する
- `071` は実装済み contract として扱い、follow-up は analyst namespace に移す

| id | title | status |
| --- | --- | --- |
| AN-001 | Claude PV digest delivery | READY |
| AN-002 | X manual ingest | IN_PROGRESS |
| AN-002-A | X manual ingest CLI + contract | READY |
| AN-003 | Revenue input bridge | PARKED |

## Scope

この namespace に含めるもの:

- Claude analyst digest
- analyst mail delivery
- X 分析 ingest
- revenue input bridge
- analyst cadence / report contract

この namespace に含めないもの:

- build / infrastructure / server 系 ticket
- `wordpressyoshilover` 側の運用 ticket
- X 自動投稿や published 書き込みの実装
