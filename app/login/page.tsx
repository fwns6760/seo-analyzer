import { redirect } from "next/navigation";
import {
  getOwnerAccessState,
  getUnauthorizedRedirectPath,
  ownerLoginErrorMessages,
  sanitizeNextPath,
} from "@/utils/owner-access";
import { appConfig } from "@/utils/runtime-config";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  const next = sanitizeNextPath(params.next);
  const ownerAccess = await getOwnerAccessState();

  if (ownerAccess.user && ownerAccess.isOwner) {
    redirect(next);
  }

  if (ownerAccess.user && ownerAccess.failureReason) {
    redirect(getUnauthorizedRedirectPath(ownerAccess.failureReason, next));
  }

  const errorMessage =
    error && error in ownerLoginErrorMessages
      ? ownerLoginErrorMessages[error as keyof typeof ownerLoginErrorMessages]
      : error;

  return (
    <main className="page-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">Supabase Auth + Google OAuth</p>
        <h1>{appConfig.appName} Login</h1>
        <p className="lede">
          許可された owner Google アカウントだけが、SEO 分析ダッシュボードに入れます。
        </p>
      </section>

      <section className="panel status-panel">
        <h2>Google でサインイン</h2>
        <p className="lede">
          ログイン後は Supabase の callback で session を交換し、許可メールと
          `profiles.role = owner` を確認してから元の画面に戻ります。
        </p>

        {errorMessage ? (
          <div className="error-box">
            <strong>ログインエラー:</strong> {errorMessage}
          </div>
        ) : null}

        <form action="/auth/login" method="post">
          <input name="next" type="hidden" value={next} />
          <button className="primary-button" type="submit">
            Google でログイン
          </button>
        </form>
      </section>
    </main>
  );
}
