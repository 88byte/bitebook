import Link from 'next/link'
import { ArrowLeft, Network as NetworkIcon } from 'lucide-react'
import { requireGuide } from '../_lib/auth'

// v28.1.0c.1 — Placeholder for outfitter network management.
// Sprint 3.3 builds the actual page (invite + accept + remove
// guides into the org's guide network). Until then, the
// /app/network tile on the outfitter dashboard lands here so we
// don't 404. Visible to anyone — but the messaging is outfitter-
// flavored. Solo guides don't see this tile.
export default async function NetworkPlaceholderPage() {
  await requireGuide()
  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href="/app"
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">Network</p>
        <h1 className="bb-page-title">Guide network</h1>
        <p className="bb-page-sub">
          Invite guides into your outfitter's shared roster. Assign them to trips, see their
          availability, and manage your team in one place.
        </p>
      </header>
      <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
        <div className="bb-tile-body" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(168, 92, 50, 0.12)',
              color: 'var(--color-copper)',
              flexShrink: 0,
            }}
          >
            <NetworkIcon size={22} />
          </span>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: '1rem' }}>Coming in Sprint 3.3</strong>
            <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
              We&rsquo;re building this next. You&rsquo;ll be able to invite guides by email, set
              availability windows, and route trip assignments across your network.
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
