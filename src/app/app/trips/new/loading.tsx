export default function NewTripLoading() {
  return (
    <main className="bb-app-main" aria-busy="true" aria-live="polite">
      <header>
        <div className="bb-skel bb-skel-eyebrow" />
        <div className="bb-skel bb-skel-title mt-1" />
      </header>

      <section aria-hidden="true">
        <div className="bb-skel bb-skel-line mt-6" />
        <div className="bb-skel bb-skel-input mt-2" />
        <div className="bb-skel bb-skel-line mt-4" />
        <div className="bb-skel bb-skel-input mt-2" />
        <div className="bb-skel bb-skel-line mt-4" />
        <div className="bb-skel bb-skel-input mt-2" />
        <div className="bb-skel bb-skel-button mt-6" />
      </section>
    </main>
  )
}
