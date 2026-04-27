export default function HunterTripDetailLoading() {
  return (
    <main className="bb-app-main" aria-busy="true" aria-live="polite">
      <header>
        <div className="bb-skel bb-skel-eyebrow" />
        <div className="bb-skel bb-skel-title mt-1" />
        <div className="bb-skel bb-skel-line mt-2" />
      </header>

      <section aria-hidden="true">
        <div className="bb-skel bb-skel-section-title mt-6" />
        <div className="bb-skel bb-skel-row mt-3" />
        <div className="bb-skel bb-skel-row mt-2" />
      </section>

      <section aria-hidden="true">
        <div className="bb-skel bb-skel-section-title mt-6" />
        <div className="bb-skel bb-skel-row mt-3" />
      </section>
    </main>
  )
}
