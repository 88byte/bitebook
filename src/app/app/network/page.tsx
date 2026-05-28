import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchOutfitterNetworkSnapshot } from './actions'
import NetworkManager from './NetworkManager'

// v28.1.0e.0 Sprint 3.3 — Real network management surface.
//
// Visible to outfitter owners + admins. Solo guides who land here get
// a friendly "this is only for outfitters" message; the OutfitterDashboard
// tile is the only nav entry point, so they won't usually see it.
export default async function NetworkPage() {
  const { profile } = await requireGuide()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' ||
      profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id

  const snapshot = isOutfitterMember ? await fetchOutfitterNetworkSnapshot() : null

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
          {snapshot
            ? `Invite guides to run trips and log harvests under ${snapshot.org_name}. Their seat is covered by your subscription.`
            : 'Outfitter owners and admins can invite guides to their network. Your account is on the solo guide plan, so this page is not active for you.'}
        </p>
      </header>

      <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
        <div className="bb-tile-body">
          {snapshot ? (
            <NetworkManager snapshot={snapshot} />
          ) : (
            <p className="bb-form-help" style={{ margin: 0 }}>
              You will see your guide network here once you are on an outfitter plan.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
