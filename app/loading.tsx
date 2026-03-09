export default function RootLoading() {
  return (
    <main className="page-shell loading-shell" aria-hidden="true">
      <section className="panel hero-panel loading-card">
        <div className="loading-stack">
          <span className="loading-pill loading-pill-sm" />
          <span className="loading-line loading-line-title" />
          <span className="loading-line loading-line-body" />
        </div>
      </section>

      <section className="panel status-panel loading-card">
        <div className="loading-stack">
          <span className="loading-line loading-line-medium" />
          <span className="loading-line loading-line-body" />
          <span className="loading-line loading-line-short" />
        </div>
      </section>
    </main>
  );
}
