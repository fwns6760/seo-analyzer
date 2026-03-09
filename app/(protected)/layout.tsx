import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const primaryNavItems = [
  {
    label: "ダッシュボード",
    detail: "KPI overview",
    href: "/",
    state: "active" as const,
  },
  {
    label: "記事分析",
    detail: "Page deep dive",
    href: null,
    state: "upcoming" as const,
  },
  {
    label: "クエリ分析",
    detail: "Search intent",
    href: null,
    state: "upcoming" as const,
  },
  {
    label: "改善候補",
    detail: "Opportunity feed",
    href: null,
    state: "upcoming" as const,
  },
];

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profileResult.data?.full_name ?? user.email ?? "Unknown user";

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <div className="studio-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="studio-brand-eyebrow">Yoshilover.com</p>
            <strong>SEO Analyzer Studio</strong>
          </div>
        </div>

        <section className="studio-sidebar-section">
          <span className="studio-section-label">Workspace</span>
          <div className="studio-workspace-card">
            <strong>Private report room</strong>
            <p>BigQuery / Search Console / Analytics 4 を 1 つの画面系で運用します。</p>
          </div>
        </section>

        <section className="studio-sidebar-section">
          <span className="studio-section-label">Views</span>
          <nav className="studio-nav" aria-label="Primary">
            {primaryNavItems.map((item) =>
              item.href ? (
                <a className="studio-nav-item is-active" href={item.href} key={item.label}>
                  <span className="studio-nav-kicker">{item.detail}</span>
                  <strong>{item.label}</strong>
                </a>
              ) : (
                <div className="studio-nav-item is-upcoming" key={item.label}>
                  <span className="studio-nav-kicker">{item.detail}</span>
                  <strong>{item.label}</strong>
                  <span className="studio-nav-tag">Soon</span>
                </div>
              ),
            )}
          </nav>
        </section>

        <section className="studio-sidebar-section studio-sidebar-footer">
          <span className="studio-section-label">Operator</span>
          <div className="studio-user-card">
            <strong>{displayName}</strong>
            <p>{user.email}</p>

            <dl className="studio-user-meta">
              <div>
                <dt>Mode</dt>
                <dd>Owner only</dd>
              </div>
              <div>
                <dt>Auth</dt>
                <dd>Supabase + Google</dd>
              </div>
            </dl>

            <form action="/auth/signout" method="post">
              <button className="secondary-button" type="submit">
                ログアウト
              </button>
            </form>
          </div>
        </section>
      </aside>

      <div className="studio-main">
        <header className="studio-topbar">
          <div>
            <p className="studio-topbar-eyebrow">Modern report workspace</p>
            <h1>Looker Studio 風の分析レイアウト</h1>
          </div>

          <div className="studio-topbar-actions">
            <div className="studio-search-pill" aria-hidden="true">
              Search data source, page, query
            </div>
            <div className="studio-status-pill">Private workspace</div>
          </div>
        </header>

        <div className="studio-canvas">{children}</div>
      </div>
    </div>
  );
}
