// v27.6.0 — Stub page for Discounts / Hunters / Templates / Activity.
// Routes are wired so the sidebar links don't 404; the actual modules
// land in v27.6.1 / v27.6.2 / v27.6.3.
export default function ComingSoon({
  title,
  eyebrow,
  description,
}: {
  title: string
  eyebrow?: string
  description: string
}) {
  return (
    <main className="bb-app-main">
      <header>
        {eyebrow ? <p className="bb-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="bb-page-title">{title}</h1>
        <p className="bb-page-sub">Coming soon.</p>
      </header>
      <div className="bb-empty mt-4">
        <div className="bb-empty-title">Not built yet</div>
        <p className="bb-empty-sub">{description}</p>
      </div>
    </main>
  )
}
