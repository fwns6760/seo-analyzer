const loadingCards = Array.from({ length: 3 });
const loadingPanels = Array.from({ length: 2 });

export default function ProtectedLoading() {
  return (
    <div className="report-page loading-shell" aria-hidden="true">
      <section className="report-header-card">
        <div className="loading-stack">
          <span className="loading-pill loading-pill-sm" />
          <span className="loading-line loading-line-title" />
          <span className="loading-line loading-line-body" />
        </div>

        <div className="report-toolbar">
          {loadingCards.map((_, index) => (
            <div className="report-filter-chip loading-card" key={`toolbar-${index}`}>
              <span className="loading-pill loading-pill-xs" />
              <span className="loading-line loading-line-short" />
            </div>
          ))}
        </div>

        <div className="report-highlight-strip">
          {loadingCards.map((_, index) => (
            <article className="report-highlight-card loading-card" key={`highlight-${index}`}>
              <span className="loading-pill loading-pill-xs" />
              <span className="loading-line loading-line-medium" />
              <span className="loading-line loading-line-body" />
            </article>
          ))}
        </div>
      </section>

      <section className="insight-strip">
        {loadingCards.map((_, index) => (
          <article className="panel insight-card loading-card" key={`insight-${index}`}>
            <span className="loading-pill loading-pill-xs" />
            <span className="loading-line loading-line-medium" />
            <span className="loading-line loading-line-short" />
          </article>
        ))}
      </section>

      <section className="loading-card-grid">
        {loadingPanels.map((_, index) => (
          <article className="panel report-panel loading-card" key={`panel-${index}`}>
            <span className="loading-pill loading-pill-xs" />
            <span className="loading-line loading-line-medium" />
            <span className="loading-line loading-line-body" />
            <span className="loading-line loading-line-body" />
            <span className="loading-line loading-line-short" />
          </article>
        ))}
      </section>
    </div>
  );
}
