import { FileText } from 'lucide-react'
import { requireGuide } from '../_lib/auth'

export default async function DocsPage() {
  // Gate the route on a real session even though the body is static — keeps
  // the sidebar link aligned with the rest of /app and avoids leaking the
  // route shell to logged-out users.
  await requireGuide()

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Coming soon</p>
        <h1 className="bb-page-title">Documents</h1>
        <p className="bb-page-sub">A home for your guide paperwork, hunter docs, and warden share.</p>
      </header>

      <section className="bb-tile mt-4">
        <div className="bb-tile-body" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <FileText size={36} aria-hidden="true" style={{ color: 'var(--color-ink-soft)', margin: '0 auto' }} />
          <div className="bb-empty-title mt-2">Documents are coming in v25</div>
          <p className="bb-empty-sub">
            Custom doc upload, hunter wallet, and one-tap warden share are next on the build list.
            Bite Book will keep your tags, licenses, and harvest records together so you can hand a
            warden a single link in the field.
          </p>
        </div>
      </section>
    </main>
  )
}
