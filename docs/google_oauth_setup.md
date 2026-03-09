# Google OAuth 設定メモ

`E1-T2 Google OAuth 設定` 用の実行メモ。  
対象は `Supabase Auth + Google OAuth` の Web ログイン設定。

## 1. 固定値

- Google Cloud プロジェクト: `baseballsite`
- Supabase Project URL: `https://kpkpkchwimcerqrdurnf.supabase.co`
- Supabase Callback URL: `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`
- ローカル開発 URL: `http://localhost:3000`
- Next.js 側 callback 予定: `http://localhost:3000/auth/callback`
- Cloud Run 本番 URL: `https://seo-analyzer-web-n5hunzkyna-an.a.run.app`
- Cloud Run 本番 callback: `https://seo-analyzer-web-n5hunzkyna-an.a.run.app/auth/callback`

## 2. Google Cloud Console 側

場所:

1. `Google Cloud Console`
2. プロジェクト `baseballsite`
3. `Google Auth Platform`
4. `Clients`
5. `Create client`

設定値:

- Application type: `Web application`
- Name: `seo-analyzer-supabase-web`
- Authorized JavaScript origins:
  - `http://localhost:3000`
  - `https://seo-analyzer-web-n5hunzkyna-an.a.run.app`
- Authorized redirect URIs:
  - `https://kpkpkchwimcerqrdurnf.supabase.co/auth/v1/callback`

補足:

- 本番 Web URL がまだ未確定なので、今は `localhost` だけ入れる
- 本番 URL が決まったら、その origin を追加する
- Google への redirect URI は `Supabase Callback URL` を入れる
- `http://localhost:3000/auth/callback` は Google ではなく、後で Supabase の redirect allow list に入れる

## 3. Google Auth Platform の同意画面

最低限:

1. `Audience` を設定
2. `Branding` でアプリ名を設定
3. `Data Access` で次の scope を許可

必要 scope:

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

補足:

- この OAuth は `Supabase Auth` 用なので、追加で広い Google API scope は不要
- 敏感な scope を増やすと verification が重くなる

## 4. Supabase Dashboard 側

場所:

1. `Supabase Dashboard`
2. 対象 project: `kpkpkchwimcerqrdurnf`
3. `Authentication`
4. `Providers`
5. `Google`

設定値:

- Google Enabled: `ON`
- Client ID: Google Cloud Console で作成した値
- Client Secret: Google Cloud Console で作成した値

追加で確認:

1. `Authentication`
2. `URL Configuration`
3. Redirect URLs

入れる値:

- `http://localhost:3000/auth/callback`

本番 URL が決まったら追加:

- `https://seo-analyzer-web-n5hunzkyna-an.a.run.app/auth/callback`

## 5. 完了判定

`E1-T2` は次が揃ったら完了:

1. Google OAuth Client `Web application` を作成
2. Google 側 redirect URI に Supabase Callback URL を登録
3. Supabase の Google provider に Client ID / Secret を保存
4. Supabase の redirect allow list に `http://localhost:3000/auth/callback` を追加

本番確認の追加チェック:

5. Supabase の redirect allow list に `https://seo-analyzer-web-n5hunzkyna-an.a.run.app/auth/callback` を追加

## 6. 次タスクへの接続

`E1-T3 Next.js 側 Supabase SSR client 実装` では、次を実装する:

- `@supabase/ssr`
- browser client / server client 分離
- `app/auth/callback/route.ts`
- `signInWithOAuth({ provider: "google" })`
