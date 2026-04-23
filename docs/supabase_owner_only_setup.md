# Supabase owner only 設定メモ

`E7-T2 Supabase 側の owner 制限整理` 用の実行メモ。  
目的は、`Supabase Auth + Google OAuth` で owner 以外の user 作成をできるだけ早い段階で止めることです。

## 1. いまコードで入っている制御

- app 側では `OWNER_EMAILS` で指定した owner メール群と `profiles.role = owner` の両方を確認する
- `public.profiles.role` は migration `add_profiles_role_owner_guard` で追加済み
- `public.hook_restrict_owner_signup(event jsonb)` は migration `add_owner_signup_hook` で追加済み

補足:

- `hook_restrict_owner_signup` は `before-user-created` hook から呼ばれたときだけ、owner 以外の signup を作成前に拒否できる
- hook を有効化しない場合でも app 側の owner check で管理画面には入れない
- ただし auth user 自体は作れてしまうので、`before-user-created` hook を有効化した方が筋がよい

## 2. Supabase Dashboard でやること

場所:

1. `Supabase Dashboard`
2. project `kpkpkchwimcerqrdurnf`
3. `Authentication`

### A. Provider を Google のみに寄せる

確認すること:

- `Providers > Google` を `ON`
- 使わない provider は `OFF`
- password / phone / anonymous など、今回使わない sign-in method も `OFF`

理由:

- owner only の本命は hook と role だが、入口を Google だけに寄せた方が誤作成が減る

### B. Auth Hook を有効化する

場所:

1. `Authentication`
2. `Hooks`
3. `Before user created`

設定:

- Hook type: `Postgres function`
- Function: `public.hook_restrict_owner_signup`

期待動作:

- 現在の既定値では `fwns6760@gmail.com` だけ `{}` を返して signup を許可
- それ以外は `403` を返して user 作成自体を拒否

## 3. SQL hook の役割

`public.hook_restrict_owner_signup(event jsonb)` は、作成される user の email を見て次を返します。

- owner メールなら `{}` を返す
- owner 以外なら次の error を返す

```json
{
  "error": {
    "http_code": 403,
    "message": "Only the configured owner account can sign up."
  }
}
```

## 4. 確認ポイント

1. owner メールで Google OAuth を始める
2. `/auth/callback` 後に `/` へ戻れる
3. `profiles.role` が `owner` のままである
4. owner 以外の Google アカウントでは signup が hook で拒否される
5. 既存の非 owner user が残っていても、app 側では `/auth/unauthorized` 経由で sign out される

## 5. 運用メモ

- owner メールを変えるときは、`OWNER_EMAILS` と SQL hook の両方を同じ値に揃える
- app 側既定値は `config/runtime-defaults.json` にあり、runtime では env が優先される
- 不要な auth user がすでに作られている場合は、`Supabase Dashboard > Authentication > Users` から整理する
