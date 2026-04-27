export default function SettingsLoading() {
  return (
    <main className="bb-app-main" aria-busy="true" aria-live="polite">
      <header>
        <div className="bb-skel bb-skel-eyebrow" />
        <div className="bb-skel bb-skel-title mt-1" />
        <div className="bb-skel bb-skel-line mt-2" />
      </header>

      <section className="bb-tile mt-4" aria-hidden="true">
        <div className="bb-tile-body">
          <div className="bb-skel bb-skel-input mt-2" />
          <div className="bb-skel bb-skel-input mt-3" />
          <div className="bb-skel bb-skel-input mt-3" />
          <div className="bb-skel bb-skel-input mt-3" />
          <div className="bb-skel bb-skel-row mt-3" />
          <div className="bb-skel bb-skel-button mt-4" />
        </div>
      </section>
    </main>
  )
}
