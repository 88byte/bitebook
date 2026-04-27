// Dashboard skeleton — shown instantly on navigation while requireGuide() and
// the parallel queries finish. Matches the real dashboard layout so the
// perceived swap is just "skeleton becomes content" not "spinner becomes page".
export default function DashboardLoading() {
  return (
    <main className="bb-app-main" aria-busy="true" aria-live="polite">
      <header>
        <div className="bb-skel bb-skel-eyebrow" />
        <div className="bb-skel bb-skel-title mt-1" />
        <div className="bb-skel bb-skel-line mt-2" />
      </header>

      <section aria-hidden="true">
        <div className="bb-stat-grid mt-4">
          <div className="bb-skel bb-skel-stat" />
          <div className="bb-skel bb-skel-stat" />
          <div className="bb-skel bb-skel-stat" />
        </div>
      </section>

      <section aria-hidden="true">
        <div className="bb-skel bb-skel-section-title mt-6" />
        <div className="bb-skel bb-skel-row mt-3" />
        <div className="bb-skel bb-skel-row mt-2" />
        <div className="bb-skel bb-skel-row mt-2" />
      </section>
    </main>
  )
}
