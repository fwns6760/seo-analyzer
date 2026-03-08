import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="page-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">E1-T3 Supabase SSR Client</p>
        <h1>SEO Analyzer Auth Scaffold</h1>
        <p className="lede">
          Next.js App Router から Supabase Auth の session を server 側で読める状態
          にしました。
        </p>
      </section>

      <section className="panel status-panel">
        <h2>Session Status</h2>
        <div className="status-grid">
          <div>
            <span className="label">状態</span>
            <strong>ログイン済み</strong>
          </div>
          <div>
            <span className="label">メール</span>
            <strong>{user.email}</strong>
          </div>
          <div>
            <span className="label">ユーザー ID</span>
            <strong className="mono">{user.id}</strong>
          </div>
          <div>
            <span className="label">プロフィール名</span>
            <strong>{profileResult.data?.full_name ?? "未設定"}</strong>
          </div>
        </div>

        <form action="/auth/signout" method="post">
          <button className="primary-button" type="submit">
            ログアウト
          </button>
        </form>
      </section>
    </main>
  );
}
