export default function HunterTripsLoading() {
  return (
    <main className="bb-app-main" aria-busy="true" aria-live="polite">
      <header>
        <div className="bb-skel bb-skel-eyebrow" />
        <div className="bb-skel bb-skel-title mt-1" />
      </header>

      <section aria-hidden="true">
        <div className="bb-skel bb-skel-row mt-4" />
        <div className="bb-skel bb-skel-row mt-2" />
        <div className="bb-skel bb-skel-row mt-2" />
        <div className="bb-skel bb-skel-row mt-2" />
        <div className="bb-skel bb-skel-row mt-2" />
      </section>
    </main>
  )
}
