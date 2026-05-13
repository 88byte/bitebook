import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { requireUser } from '../_lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeUpgradeFromSessionAction } from '../upgrade-to-outfitter/actions'

// v28.1.0b — post-Stripe-Checkout landing. If the webhook has already
// fired, the user's profile.account_tier is now 'outfitter_owner' and
// outfitter_orgs has their row. If it hasn't fired yet (race), we
// re-run completeOutfitterUpgrade synchronously here as a fallback —
// idempotent with the webhook so no double-write.
type SP = Promise<{ session_id?: string }>

export default async function UpgradeSuccessPage({ searchParams }: { searchParams: SP }) {
  const { profile } = await requireUser()
  const sp = await searchParams
  const sessionId = sp.session_id

  // Try to load the org. If account_tier already flipped + org exists,
  // webhook beat us. Otherwise run the fallback.
  const admin = createAdminClient()
  let orgRow: { id: string; name: string; subscription_status: string; logo_url: string | null } | null = null
  if (profile.account_tier === 'outfitter_owner' && profile.current_outfitter_org_id) {
    const { data } = await admin
      .from('outfitter_orgs')
      .select('id, name, subscription_status, logo_url')
      .eq('id', profile.current_outfitter_org_id)
      .maybeSingle()
    orgRow = data ?? null
  }

  if (!orgRow && sessionId) {
    // Webhook hasn't fired yet — run completion ourselves. Idempotent.
    const res = await completeUpgradeFromSessionAction(sessionId)
    if ('error' in res) {
      // Couldn't complete. Likely Stripe customer/session not ready.
      // Surface gracefully and let user retry / contact support.
      return (
        <main className="bb-app-main">
          <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
            <header>
              <p className="bb-page-eyebrow">Upgrade</p>
              <h1 className="bb-page-title">Almost there</h1>
            </header>
            <section className="bb-tile bb-form-section" style={{ marginTop: '0.75rem' }}>
              <div className="bb-tile-body">
                <p>
                  Stripe is still processing your subscription. Refresh in
                  a moment to land on your new outfitter dashboard. If this
                  message persists, ping us at{' '}
                  <a href="mailto:support@lastbite.pro" style={{ color: 'var(--color-copper)' }}>
                    support@lastbite.pro
                  </a>{' '}
                  and we&rsquo;ll sort it.
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)', marginTop: '0.5rem' }}>
                  Detail: {res.error}
                </p>
              </div>
            </section>
          </div>
        </main>
      )
    }
    // Re-fetch the freshly-created org (server-side helper just
    // wrote the row through the admin client).
    const { data } = await admin
      .from('outfitter_orgs')
      .select('id, name, subscription_status, logo_url')
      .eq('owner_profile_id', profile.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    orgRow = data ?? null
  }

  if (!orgRow) {
    // No session_id and no org. Probably arrived here directly.
    redirect('/app')
  }

  // v28.1.0b.1 — comp orgs (test-bypass) get distinct copy so the
  // billing language doesn't claim a trial exists when one doesn't.
  const isComp = orgRow.subscription_status === 'comp'

  return (
    <main className="bb-app-main">
      <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
        <header>
          <p className="bb-page-eyebrow">{isComp ? 'Test mode' : 'Welcome'}</p>
          <h1 className="bb-page-title">You&rsquo;re an outfitter</h1>
          <p className="bb-page-sub">
            {isComp
              ? 'Comp org provisioned for testing. No card on file. This row will be wiped before public launch.'
              : 'Your 7-day trial is live. We’ll send a reminder before it converts.'}
          </p>
        </header>

        <section
          className="bb-tile"
          style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            background: 'rgba(168, 92, 50, 0.08)',
            borderColor: 'var(--color-copper)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={22} aria-hidden="true" style={{ color: 'var(--color-copper)', flexShrink: 0 }} />
          <div style={{ flex: '1 1 0' }}>
            <div style={{ fontWeight: 600 }}>{orgRow.name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
              Subscription: <strong>{orgRow.subscription_status}</strong>
            </div>
          </div>
        </section>

        <section className="bb-tile bb-form-section" style={{ marginTop: '0.75rem' }}>
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Next steps</h2>
            <ul style={{ fontSize: '0.95rem', color: 'var(--color-ink)', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
              <li>Invite your team (admin seats)</li>
              <li>Add guides to your network</li>
              <li>Set your availability</li>
            </ul>
            <div style={{ marginTop: '1rem' }}>
              <Link href="/app" className="bb-cta-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                Go to dashboard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
