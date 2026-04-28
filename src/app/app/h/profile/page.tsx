import Link from 'next/link'
import { requireHunter } from '../../_lib/auth'
import HunterProfileForm from './HunterProfileForm'

export default async function HunterProfilePage() {
  const { profile } = await requireHunter()

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Account</p>
        <h1 className="bb-page-title">Profile</h1>
        <p className="bb-page-sub">
          Your name and phone are what your guide sees on shared trips.
        </p>
      </header>

      <div className="bb-form-narrow">
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <HunterProfileForm
              initial={{
                display_name: profile.display_name ?? '',
                phone: profile.phone ?? '',
                avatar_url: profile.avatar_url ?? null,
              }}
            />
          </div>
        </section>

        {/* v25.9: 1-tap support link for mobile users (sidebar is hidden <1024px). */}
        <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
          Need a hand? <Link href="/app/h/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>Help</Link>
        </p>
      </div>
    </main>
  )
}
