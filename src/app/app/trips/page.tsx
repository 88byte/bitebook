import Link from 'next/link'
import { Plus, Archive, Bookmark } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchTripsPage, fetchRecentTrips } from '../_lib/queries'
import { fetchGuideTripTemplates } from '../_lib/trip-template-queries'
import TripRow from '../_components/TripRow'
import DashboardHero from '../_components/DashboardHero'
import TripTemplatesList from './TripTemplatesList'
import type { Database } from '@/lib/supabase/types'
import { TRIP_FILTER_LABEL } from '@/lib/labels'

type TripStatus = Database['public']['Enums']['trip_status']

const PAGE_SIZE = 20
// v27.1.5.3: filter labels pull from the central labels.ts map. Pre-trip /
// In field / Wrapped collapse to Active / In progress / Done so the chip
// row matches the StatusPill on each row + the wallet status vocabulary.
const STATUSES: { key: TripStatus | 'all'; label: string }[] = [
  { key: 'all', label: TRIP_FILTER_LABEL.all },
  { key: 'planned', label: TRIP_FILTER_LABEL.planned },
  { key: 'active', label: TRIP_FILTER_LABEL.active },
  { key: 'completed', label: TRIP_FILTER_LABEL.completed },
  { key: 'canceled', label: TRIP_FILTER_LABEL.canceled },
]

// v27.1.4: top-level tabs — Trips (existing list) vs Templates (saved
// reusable trip blueprints). URL-driven via ?tab=, default 'trips'.
// Same pattern as the docs library tabs.
type TripsTab = 'trips' | 'templates'
function isTripsTab(s: string | undefined): s is TripsTab {
  return s === 'trips' || s === 'templates'
}

type SearchParams = Promise<{
  status?: string
  page?: string
  tab?: string
  archived?: string
}>

export default async function TripsListPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const params = await searchParams
  const tab: TripsTab = isTripsTab(params.tab) ? params.tab : 'trips'

  const statusParam = params.status as TripStatus | 'all' | undefined
  const status: TripStatus | 'all' =
    statusParam && STATUSES.some((s) => s.key === statusParam) ? statusParam : 'all'

  const page = Math.max(1, Number(params.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const includeArchived = params.archived === '1'

  // Fetch both side-by-side so the tab counts in the header are accurate.
  // Templates list uses includeArchived semantics — when toggle is on, the
  // list shows ARCHIVED ONLY (matches docs-library archive-filter semantics).
  const [{ rows, total }, templates, allTemplates, recentRaw] = await Promise.all([
    fetchTripsPage(profile.id, { status, from, to }),
    fetchGuideTripTemplates(profile.id, { includeArchived }),
    // active-only count for the tab header — independent of the archive
    // toggle so the tab label stays stable as the guide flips it.
    fetchGuideTripTemplates(profile.id, { includeArchived: false }),
    // v27.3.2.1: recent wrapped trips for the desktop right-rail aside.
    fetchRecentTrips(profile.id),
  ])

  // v27.3.3 — Recent rail dedupe. Strip out any trips already visible
  // in the main filtered list so a single trip never appears in both
  // columns at once. (e.g. when the chip is "Done", recent wrapped
  // trips are obviously the same rows.)
  const visibleIds = new Set(rows.map((r) => r.id))
  const recentForAside = recentRaw.filter((r) => !visibleIds.has(r.id))
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function chipHref(key: TripStatus | 'all') {
    const sp = new URLSearchParams()
    if (key !== 'all') sp.set('status', key)
    return `/app/trips${sp.toString() ? `?${sp}` : ''}`
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams()
    if (status !== 'all') sp.set('status', status)
    if (p !== 1) sp.set('page', String(p))
    return `/app/trips${sp.toString() ? `?${sp}` : ''}`
  }

  function tabHref(target: TripsTab): string {
    const sp = new URLSearchParams()
    if (target !== 'trips') sp.set('tab', target)
    if (target === 'templates' && includeArchived) sp.set('archived', '1')
    if (target === 'trips' && status !== 'all') sp.set('status', status)
    const q = sp.toString()
    return `/app/trips${q ? `?${q}` : ''}`
  }

  function archiveToggleHref(): string {
    const sp = new URLSearchParams()
    sp.set('tab', 'templates')
    if (!includeArchived) sp.set('archived', '1')
    return `/app/trips?${sp.toString()}`
  }

  const heroSub =
    tab === 'templates'
      ? `${allTemplates.length} ${allTemplates.length === 1 ? 'template' : 'templates'}`
      : `${total} ${total === 1 ? 'trip' : 'trips'}${
          status !== 'all' ? ` · ${STATUSES.find((s) => s.key === status)?.label}` : ''
        }`

  return (
    <main className="bb-app-main">
      {/* v27.3.6: Create trip CTA moved INTO the banner via rightSlot
          (which renders below the subtitle per v27.3.4.1). Same
          pattern as the invite-hunter inline form on /app/hunters. */}
      <DashboardHero
        eyebrow="Your trips"
        title="My trips"
        subtitle={heroSub}
        bgImage="/banners/trips-hero.png"
        eyebrowColor="copper"
        showShield={false}
        objectPosition="top"
        rightSlot={
          tab === 'trips' && total > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/trips/new" className="bb-cta-sm" aria-label="Create trip">
                <Plus size={16} aria-hidden="true" />
                Create trip
              </Link>
            </div>
          ) : null
        }
      />

      {/* v27.5.0.4 — bb-page-divider removed. The tabs nav directly
          below carries its own borderBottom (1px solid card-divider),
          so stacking both produced two horizontal lines under the
          banner. The tab nav line alone is enough separation. */}

      {/* v27.1.4: top-level tabs — Trips vs Templates. Mirrors the docs
          library tab pattern (copper underline on active, URL-driven). */}
      <nav
        className="mt-4 flex gap-4"
        role="tablist"
        aria-label="Trips section"
        style={{ borderBottom: '1px solid var(--color-card-divider)' }}
      >
        <Link
          href={tabHref('trips')}
          role="tab"
          aria-selected={tab === 'trips'}
          style={{
            padding: '0.5rem 0.25rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: tab === 'trips' ? 'var(--color-copper)' : 'var(--color-ink-soft)',
            textDecoration: 'none',
            borderBottom:
              tab === 'trips' ? '2px solid var(--color-copper)' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          Trips
          <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 4 }}>({total})</span>
        </Link>
        <Link
          href={tabHref('templates')}
          role="tab"
          aria-selected={tab === 'templates'}
          style={{
            padding: '0.5rem 0.25rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: tab === 'templates' ? 'var(--color-copper)' : 'var(--color-ink-soft)',
            textDecoration: 'none',
            borderBottom:
              tab === 'templates' ? '2px solid var(--color-copper)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <Bookmark size={14} aria-hidden="true" />
          Templates
          <span style={{ opacity: 0.65, fontWeight: 500 }}>({allTemplates.length})</span>
        </Link>
      </nav>

      {tab === 'trips' ? (
        <>
          <div className="bb-chip-row mt-4" role="tablist" aria-label="Filter by status">
            {STATUSES.map((s) => (
              <Link
                key={s.key}
                href={chipHref(s.key)}
                role="tab"
                aria-selected={status === s.key}
                className={`bb-chip ${status === s.key ? 'is-active' : ''}`}
              >
                {s.label}
              </Link>
            ))}
          </div>

          {/* v27.3.2.1: 2-col layout on desktop. Left = chip-filtered
              trips list (primary). Right (>=1024px) = sticky aside with
              "Recent trips" — most recent wrapped trips for quick access.
              Mobile stacks single-col. Mirrors /app dashboard pattern. */}
          <div className="bb-trips-grid mt-4">
            <section>
              {/* v27.3.5: matching section head on the left column to
                  pair with "Recent trips" on the right. Reads as a
                  proper 2-col layout. */}
              <div className="bb-net-section-head">
                <span className="bb-net-section-icon" aria-hidden="true">
                  <Bookmark size={14} />
                </span>
                <span className="bb-net-section-title">
                  {status === 'all' ? 'Active trips' : (STATUSES.find((s) => s.key === status)?.label ?? 'Trips')}
                </span>
              </div>
              {rows.length === 0 ? (
                <div className="bb-empty">
                  <div className="bb-empty-title">No trips match this filter</div>
                  <p className="bb-empty-sub">
                    {status === 'all'
                      ? 'Create a trip to start logging hunters and harvests.'
                      : 'Try another status or clear the filter.'}
                  </p>
                  {status === 'all' ? (
                    <Link href="/app/trips/new" className="bb-cta-sm mt-3 inline-flex">
                      <Plus size={16} aria-hidden="true" />
                      Log your first trip
                    </Link>
                  ) : (
                    <Link href="/app/trips" className="bb-btn-secondary mt-3 inline-flex">
                      Show all trips
                    </Link>
                  )}
                </div>
              ) : (
                <div role="list" className="flex flex-col gap-3">
                  {rows.map((t) => (
                    <div role="listitem" key={t.id}>
                      <TripRow trip={t} hunters={t.hunters} rating={t.rating} reviewCount={t.reviewCount} />
                    </div>
                  ))}
                </div>
              )}

              {pageCount > 1 && (
                <nav className="bb-pager" aria-label="Pagination">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="bb-btn-secondary">← Previous</Link>
                  ) : <span />}
                  <span>Page {page} of {pageCount}</span>
                  {page < pageCount ? (
                    <Link href={pageHref(page + 1)} className="bb-btn-secondary">Next →</Link>
                  ) : <span />}
                </nav>
              )}
            </section>

            {/* v27.3.3.1: Recent column ALWAYS renders (was gated on
                recentForAside.length>0 — that hid the column when the
                main filter already showed every recent trip). Empty
                state replaces the list when dedupe leaves nothing. */}
            <aside className="bb-trips-grid-aside bb-col-divider">
              <div className="bb-net-section-head">
                <span className="bb-net-section-icon" aria-hidden="true">
                  <Bookmark size={14} />
                </span>
                <span className="bb-net-section-title">Recent trips</span>
              </div>
              {recentForAside.length === 0 ? (
                <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
                  Nothing extra — your recent trips are already visible in the list.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentForAside.slice(0, 5).map((t) => (
                    <TripRow
                      key={t.id}
                      trip={t}
                      hunters={t.hunters}
                      rating={t.rating}
                      reviewCount={t.reviewCount}
                    />
                  ))}
                </div>
              )}
            </aside>
          </div>
        </>
      ) : (
        <>
          {/* Templates tab — show-archived chip mirrors docs library. */}
          <nav
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Template filters"
          >
            <Link
              href={archiveToggleHref()}
              className={includeArchived ? 'bb-chip is-active' : 'bb-chip'}
              aria-pressed={includeArchived}
              style={{ marginLeft: 'auto' }}
            >
              <Archive size={12} aria-hidden="true" style={{ marginRight: 4 }} />
              {includeArchived ? 'Hide archived' : 'Show archived'}
            </Link>
          </nav>

          <section className="mt-4">
            {templates.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">
                  {includeArchived ? 'No archived templates' : 'No templates yet'}
                </div>
                <p className="bb-empty-sub">
                  {includeArchived
                    ? 'Archived templates appear here. Restore one to use it again on a new trip.'
                    : 'No templates yet. Save a trip as a template from any trip’s detail page to reuse it later.'}
                </p>
              </div>
            ) : (
              <TripTemplatesList templates={templates} />
            )}
          </section>
        </>
      )}
    </main>
  )
}
