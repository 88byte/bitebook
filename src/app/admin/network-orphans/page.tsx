import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../../app/_lib/auth'

// v28.1.0e.2 — Mission Control flag list for network guides who joined
// during the v28.1.0e.0 free-window OR otherwise ended up with an
// active outfitter_guide_network row but no personal guide
// subscription. Flavio surfaces them here and decides what to do
// (suspend, comp, refund-out, etc.). We intentionally do NOT
// auto-suspend; the row stays active until Flavio acts.

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

export default async function NetworkOrphansPage() {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('outfitter_guide_network')
    .select('id, org_id, guide_profile_id, accepted_at')
    .eq('status', 'active')

  type Orphan = {
    network_id: string
    guide_id: string
    guide_name: string
    guide_email: string | null
    org_id: string
    org_name: string
    accepted_at: string | null
    sub_status: string | null
  }
  const orphans: Orphan[] = []

  for (const r of rows ?? []) {
    const { data: sub } = await admin
      .from('outfitter_subscriptions')
      .select('status, comp_until')
      .eq('guide_id', r.guide_profile_id)
      .maybeSingle()
    const today = new Date().toISOString().slice(0, 10)
    const isCovered =
      !!sub &&
      (sub.status === 'trialing' ||
        sub.status === 'active' ||
        (sub.comp_until && sub.comp_until >= today))
    if (isCovered) continue

    let guideName = 'Guide'
    let guideEmail: string | null = null
    let orgName = 'Outfitter'
    try {
      const { data: prof } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', r.guide_profile_id)
        .maybeSingle()
      guideName = prof?.display_name || guideName
    } catch {/* ignore */}
    try {
      const { data: au } = await admin.auth.admin.getUserById(r.guide_profile_id)
      guideEmail = au?.user?.email ?? null
    } catch {/* ignore */}
    try {
      const { data: org } = await admin
        .from('outfitter_orgs')
        .select('name')
        .eq('id', r.org_id)
        .maybeSingle()
      orgName = org?.name || orgName
    } catch {/* ignore */}

    orphans.push({
      network_id: r.id,
      guide_id: r.guide_profile_id,
      guide_name: guideName,
      guide_email: guideEmail,
      org_id: r.org_id,
      org_name: orgName,
      accepted_at: r.accepted_at,
      sub_status: sub?.status ?? null,
    })
  }

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href="/admin"
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Mission Control
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">Mission Control</p>
        <h1 className="bb-page-title">Network guides without subscriptions</h1>
        <p className="bb-page-sub">
          Active outfitter_guide_network rows with no trialing, active, or comp personal subscription. Created during the v28.1.0e.0 free window or later. Decide per row whether to suspend, comp, or contact.
        </p>
      </header>

      <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
        <div className="bb-tile-body">
          {orphans.length === 0 ? (
            <p className="bb-form-help" style={{ margin: 0 }}>
              No orphaned network guides. Every active membership has a covering subscription.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {orphans.map((o) => (
                <li
                  key={o.network_id}
                  style={{
                    padding: '0.7rem 0.85rem',
                    border: '1px dashed var(--color-card-divider)',
                    borderRadius: 8,
                    background: 'var(--color-paper-tint)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{o.guide_name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', overflowWrap: 'anywhere' }}>
                    {o.guide_email || ''} {' • '} Joined {o.org_name}
                    {o.accepted_at ? ` on ${fmtDate(o.accepted_at)}` : ''}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)', marginTop: 4 }}>
                    Sub status: <strong>{o.sub_status ?? 'no row'}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  )
}
