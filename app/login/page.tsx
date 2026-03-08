import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  const next = params.next?.startsWith("/") ? params.next : "/";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next);
  }

  return (
    <main className="page-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">Supabase Auth + Google OAuth</p>
        <h1>SEO Analyzer Login</h1>
        <p className="lede">
          Google アカウントでログインして、SEO 分析ダッシュボードに入ります。
        </p>
      </section>

      <section className="panel status-panel">
        <h2>Google でサインイン</h2>
        <p className="lede">
          ログイン後は Supabase の callback で session を交換し、元の画面に戻ります。
        </p>

        {error ? (
          <div className="error-box">
            <strong>ログイン開始エラー:</strong> {error}
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
