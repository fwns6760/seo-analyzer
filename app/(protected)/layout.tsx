import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StudioNav } from "@/components/studio-nav";
import { createClient } from "@/utils/supabase/server";

const primaryNavItems = [
  {
    label: "ダッシュボード",
    detail: "Overview / KPI",
    href: "/",
  },
  {
    label: "記事分析",
    detail: "Page deep dive",
    href: "/articles",
  },
  {
    label: "クエリ分析",
    detail: "Query deep dive",
    href: "/queries",
  },
  {
    label: "改善候補",
    detail: "Opportunity feed",
    href: "/opportunities",
  },
];

function getViewMeta(pathname: string) {
  if (pathname.startsWith("/articles")) {
    return {
      eyebrow: "Page deep dive",
      title: "記事ごとの流入と変化を読む",
      description: "ページ単位で KPI、日次推移、流入クエリをひと続きに見て、次の打ち手を決めます。",
      focus: "ページ別の勝ち筋と失速を把握する",
      status: "Page analysis",
      hint: "見る順番: scorecard -> 日次推移 -> 流入クエリ",
    };
  }

  if (pathname.startsWith("/queries")) {
    return {
      eyebrow: "Query deep dive",
      title: "クエリの意図と分散を追う",
      description: "検索語ごとの獲得状況と紐づくページを並べて、意図とカニバリの兆候を見ます。",
      focus: "検索語の分散と上位ページを把握する",
      status: "Query analysis",
      hint: "見る順番: scorecard -> page count -> 紐づくページ",
    };
  }

  if (pathname.startsWith("/opportunities")) {
    return {
      eyebrow: "Opportunity feed",
      title: "改善候補を一覧で整理して次の深掘り先を決める",
      description:
        "順位下落、伸びた記事、リライト候補、カニバリ候補を切り替えながら、優先順位と遷移先を同時に確認します。",
      focus: "候補タイプごとの優先順位と次の分析先を素早く確定する",
      status: "Opportunity feed",
      hint: "見る順番: feed 切替 -> 候補選択 -> 深掘り",
    };
  }

  return {
    eyebrow: "Weekly overview",
    title: "週次の変化から次の分析先を決める",
    description: "KPI と改善候補を同じ視線に置いて、どのページやクエリを掘るべきかをすぐ判断できる状態にします。",
    focus: "優先順位の高い改善候補を素早く見つける",
    status: "Overview",
    hint: "見る順番: KPI -> 改善候補 -> 上位ページ",
  };
}

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") ?? "/";
  const search = requestHeaders.get("x-search") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profileResult.data?.full_name ?? user.email ?? "Unknown user";
  const currentView = getViewMeta(pathname);

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
          <StudioNav items={primaryNavItems} />
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
          <div className="studio-topbar-copyblock">
            <p className="studio-topbar-eyebrow">{currentView.eyebrow}</p>
            <h1>{currentView.title}</h1>
            <p className="studio-topbar-copy">{currentView.description}</p>
          </div>

          <div className="studio-topbar-actions">
            <div className="studio-status-pill">{currentView.status}</div>
            <div className="studio-status-pill is-muted">Daily batch sync</div>
            <div className="studio-search-pill" aria-hidden="true">
              {currentView.hint}
            </div>
          </div>
        </header>

        <section className="studio-context-strip" aria-label="Workspace context">
          <article className="studio-context-card">
            <span className="label">Focus</span>
            <strong>{currentView.focus}</strong>
            <p>今日の判断を早くするための主目的です。</p>
          </article>
          <article className="studio-context-card">
            <span className="label">Data source</span>
            <strong>BigQuery mart + raw</strong>
            <p>Search Console と Analytics 4 を日次 batch で集約しています。</p>
          </article>
          <article className="studio-context-card">
            <span className="label">Workspace mode</span>
            <strong>Owner-only analysis</strong>
            <p>自分専用の分析画面として、速度と判断性を優先しています。</p>
          </article>
        </section>

        <div className="studio-canvas">{children}</div>
      </div>
    </div>
  );
}
