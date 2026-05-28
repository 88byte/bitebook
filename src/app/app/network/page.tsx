import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchOutfitterNetworkSnapshot } from './actions'
import NetworkManager from './NetworkManager'
import HuntersListView from '../hunters/HuntersListView'
import InviteForm from '../hunters/InviteForm'

// v28.1.0e.1 — Tabbed Network surface for outfitter members.
//   Tabs: Guides | Hunters. Default = guides.
//   Solo guides who deep-link here still see the not-active-for-you
//   copy. Pure-guide /app/hunters keeps its own banner-style page;
//   outfitter members are redirected away from /app/hunters into
//   /app/network?tab=hunters.

type SP = Promise<{ tab?: string; q?: string }>
type Tab = 'guides' | 'hunters'

function parseTab(v: string | undefined): Tab {
  return v === 'hunters' ? 'hunters' : 'guides'
}

export default async function NetworkPage({ searchParams }: { searchParams: SP }) {
  const { profile, contextGuideId } = await requireGuide()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' ||
      profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id

  const sp = await searchParams
  const tab: Tab = parseTab(sp.tab)
  const query = (sp.q ?? '').trim()

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
        <h1 className="bb-page-title">
          {tab === 'hunters' ? 'Hunters' : 'Guide network'}
        </h1>
        <p className="bb-page-sub">
          {snapshot
            ? tab === 'hunters'
              ? `Hunters across ${snapshot.org_name}. Invite, manage, and link them to trips.`
              : `Invite guides to run trips and log harvests under ${snapshot.org_name}. Their seat is covered by your subscription.`
            : 'Outfitter owners and admins can manage their network here. Your account is on the solo guide plan, so this page is not active for you.'}
        </p>
      </header>

      {snapshot ? (
        <>
          {/* Tab strip — light cream/editorial styling consistent with
              other admin chrome. Active tab gets a copper underline +
              ink color; inactive tabs are subdued ink-muted. Mobile
              keeps them on one row, never stacks. */}
          <nav
            role="tablist"
            aria-label="Network sections"
            className="bb-network-tabs mt-4"
            style={{
              display: 'flex',
              gap: '0.25rem',
              borderBottom: '1px solid var(--color-card-divider)',
              overflowX: 'auto',
              flexWrap: 'nowrap',
            }}
          >
            <TabLink href="/app/network?tab=guides" active={tab === 'guides'}>
              Guides
            </TabLink>
            <TabLink href="/app/network?tab=hunters" active={tab === 'hunters'}>
              Hunters
            </TabLink>
          </nav>

          {tab === 'guides' ? (
            <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
              <div className="bb-tile-body">
                <NetworkManager snapshot={snapshot} />
              </div>
            </section>
          ) : (
            <section style={{ marginTop: '1rem' }}>
              {/* Mobile-only invite card mirrors /app/hunters so admins
                  on phones can invite without scrolling. Desktop uses
                  the InviteForm inline below the search via the existing
                  bb-hunters-mobile-invite media query. */}
              <section className="bb-net-card bb-net-invite bb-hunters-mobile-invite">
                <InviteForm />
              </section>
              <HuntersListView
                contextGuideId={contextGuideId}
                query={query}
                searchActionPath="/app/network"
                hiddenSearchFields={{ tab: 'hunters' }}
                showMobileInviteCard={false}
              />
            </section>
          )}
        </>
      ) : (
        <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
          <div className="bb-tile-body">
            <p className="bb-form-help" style={{ margin: 0 }}>
              You will see your guide network and org hunters here once you are on an outfitter plan.
            </p>
          </div>
        </section>
      )}
    </main>
  )
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.6rem 0.95rem',
        fontWeight: 600,
        fontSize: '0.92rem',
        textDecoration: 'none',
        color: active ? 'var(--color-ink)' : 'var(--color-ink-muted)',
        borderBottom: active ? '2px solid var(--color-copper)' : '2px solid transparent',
        marginBottom: -1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  )
}
