import Link from 'next/link'
import { Building2, MapPin, Users, Calendar, Network, UserCog } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

// v28.1.0b — Outfitter dashboard variant. Renders when the viewing
// user's profile.account_tier is 'outfitter_owner' or 'outfitter_admin'
// and they have a current_outfitter_org_id. Reads the org row +
// member/network/hunter counts via the admin client (trust boundary is
// the requireGuide gate in /app/page.tsx).
//
// Tile destinations:
//   All Trips → /app/trips (existing; org-aware in 3.4)
//   Network   → /app/network (placeholder for 3.3)
//   Hunters   → /app/hunters (existing; org-aware in 3.4)
//   Team      → /app/settings/team (lands in 3.2c)
//   Calendar  → /app/calendar (existing; org-aware in 3.5)
export default async function OutfitterDashboard({
  orgId,
  viewer,
}: {
  orgId: string
  viewer: { id: string; name: string }
}) {
  const admin = createAdminClient()
  const [orgRes, memberCntRes, guideCntRes, hunterCntRes] = await Promise.all([
    admin
      .from('outfitter_orgs')
      .select('id, name, state, business_address, logo_url, subscription_status, created_at')
      .eq('id', orgId)
      .maybeSingle(),
    admin
      .from('outfitter_org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('removed_at', null),
    admin
      .from('outfitter_guide_network')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    admin
      .from('outfitter_hunter_network')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  const org = orgRes.data
  if (!org) {
    return (
      <main className="bb-app-main">
        <p style={{ color: '#8C3C2A' }}>Could not load your outfitter org. Try refreshing.</p>
      </main>
    )
  }

  const memberCount = memberCntRes.count ?? 1
  const guideCount = guideCntRes.count ?? 0
  const hunterCount = hunterCntRes.count ?? 0
  const subPillBg = org.subscription_status === 'active'
    ? 'rgba(63, 107, 58, 0.12)'
    : 'rgba(168, 92, 50, 0.12)'
  const subPillColor = org.subscription_status === 'active' ? '#3F6B3A' : 'var(--color-copper)'

  type Tile = { href: string; label: string; Icon: typeof Calendar; subtitle: string }
  const tiles: Tile[] = [
    { href: '/app/trips', label: 'All Trips', Icon: Calendar, subtitle: 'Plan, assign, wrap' },
    { href: '/app/network', label: 'Network', Icon: Network, subtitle: 'Guides on your team' },
    { href: '/app/hunters', label: 'Hunters', Icon: Users, subtitle: 'Clients across the org' },
    { href: '/app/settings/team', label: 'Team', Icon: UserCog, subtitle: 'Admin seats' },
    { href: '/app/calendar', label: 'Calendar', Icon: Calendar, subtitle: 'Org-wide schedule' },
  ]

  return (
    <main className="bb-app-main">
      {/* Hero — org name + logo + subscription pill + stats */}
      <section
        className="bb-tile"
        style={{
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(168, 92, 50, 0.10), rgba(168, 92, 50, 0.02))',
          borderColor: 'var(--color-copper)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          {org.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={org.logo_url}
              alt={`${org.name} logo`}
              style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, background: '#FFF' }}
            />
          ) : (
            <span
              style={{
                width: 64,
                height: 64,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                background: 'var(--color-copper)',
                color: '#FFFFFF',
              }}
            >
              <Building2 size={28} aria-hidden="true" />
            </span>
          )}
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <p className="bb-page-eyebrow" style={{ marginBottom: 2 }}>Outfitter</p>
          <h1 className="bb-page-title" style={{ marginBottom: 4 }}>{org.name}</h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              fontSize: '0.85rem',
              color: 'var(--color-ink-soft)',
            }}
          >
            <span
              style={{
                padding: '0.2rem 0.55rem',
                borderRadius: 999,
                background: subPillBg,
                color: subPillColor,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {org.subscription_status}
            </span>
            {org.state && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={12} aria-hidden="true" />
                {org.state}
              </span>
            )}
            <span>{memberCount} {memberCount === 1 ? 'admin' : 'admins'}</span>
            <span>·</span>
            <span>{guideCount} network {guideCount === 1 ? 'guide' : 'guides'}</span>
            <span>·</span>
            <span>{hunterCount} {hunterCount === 1 ? 'hunter' : 'hunters'}</span>
          </div>
        </div>
      </section>

      {/* Tile grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
          gap: '0.75rem',
          marginTop: '1rem',
        }}
      >
        {tiles.map(({ href, label, Icon, subtitle }) => (
          <Link
            key={href}
            href={href}
            className="bb-tile"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                background: 'rgba(168, 92, 50, 0.12)',
                color: 'var(--color-copper)',
              }}
            >
              <Icon size={18} />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{label}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>{subtitle}</div>
          </Link>
        ))}
      </div>

      {/* Recent activity placeholder — wired in 3.5/3.6 */}
      <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Recent activity</h2>
          <p className="bb-form-help">
            Trips, network changes, and reviews will appear here as your org operates.
            Hello, {viewer.name}.
          </p>
        </div>
      </section>
    </main>
  )
}
