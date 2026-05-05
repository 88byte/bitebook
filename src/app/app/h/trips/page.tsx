import Link from 'next/link'
import { CalendarDays, LayoutList, Bookmark } from 'lucide-react'
import { requireHunter } from '../../_lib/auth'
import {
  fetchHunterTripsPage,
  fetchHunterTripsInRange,
  fetchHunterPendingWalletLinks,
} from '../../_lib/queries'
import HunterTripRow from '../_components/HunterTripRow'
import DashboardHero from '../../_components/DashboardHero'
import TripsCalendar from '../../trips/TripsCalendar'
import type { Database } from '@/lib/supabase/types'

import { TRIP_FILTER_LABEL } from '@/lib/labels'

type TripStatus = Database['public']['Enums']['trip_status']

const PAGE_SIZE = 20
// v27.1.5.3: filter labels via central labels.ts (Active / In progress /
// Done) so the chip row matches the row pill.
const STATUSES: { key: TripStatus | 'all'; label: string }[] = [
  { key: 'all', label: TRIP_FILTER_LABEL.all },
  { key: 'planned', label: TRIP_FILTER_LABEL.planned },
  { key: 'active', label: TRIP_FILTER_LABEL.active },
  { key: 'completed', label: TRIP_FILTER_LABEL.completed },
  { key: 'canceled', label: TRIP_FILTER_LABEL.canceled },
]

type SearchParams = Promise<{
  status?: string
  page?: string
  ym?: string
  view?: string
}>

export default async function HunterTripsListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { profile } = await requireHunter()
  const params = await searchParams

  const statusParam = params.status as TripStatus | 'all' | undefined
  const status: TripStatus | 'all' =
    statusParam && STATUSES.some((s) => s.key === statusParam) ? statusParam : 'all'

  const page = Math.max(1, Number(params.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // v27.6.3.2 — calendar month nav. ?ym=YYYY-MM, default current month.
  const ymRaw = params.ym ?? ''
  const ymMatch = /^(\d{4})-(\d{2})$/.exec(ymRaw)
  const today = new Date()
  const calYear = ymMatch ? Number(ymMatch[1]) : today.getFullYear()
  const calMonth = ymMatch ? Number(ymMatch[2]) - 1 : today.getMonth()
  // 6-week visible range (Sunday on/before the 1st through 6 weeks).
  const calGridStart = new Date(calYear, calMonth, 1)
  calGridStart.setDate(calGridStart.getDate() - calGridStart.getDay())
  calGridStart.setHours(0, 0, 0, 0)
  const calGridEnd = new Date(calGridStart)
  calGridEnd.setDate(calGridEnd.getDate() + 41)
  calGridEnd.setHours(23, 59, 59, 999)

  // v27.6.3.2 — mobile view toggle: ?view=calendar shows the calendar
  // full-screen on mobile; default cards. Desktop ignores via CSS.
  const mobileView: 'cards' | 'calendar' = params.view === 'calendar' ? 'calendar' : 'cards'

  const [{ rows, total }, pendingWalletLinks, calendarTrips] = await Promise.all([
    fetchHunterTripsPage(profile.id, { status, from, to }),
    // v27.1.3.0.6 — same cross-trip pending feed used on the dashboard.
    // Returns rows only for planned/active trips, so wrapped/canceled
    // rows in this list never get a badge (they default to count 0).
    fetchHunterPendingWalletLinks(profile.id),
    fetchHunterTripsInRange(profile.id, calGridStart.toISOString(), calGridEnd.toISOString(), status),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pendingByTripId = new Map<string, number>()
  for (const w of pendingWalletLinks) {
    pendingByTripId.set(w.trip_id, (pendingByTripId.get(w.trip_id) ?? 0) + 1)
  }

  function chipHref(key: TripStatus | 'all') {
    const sp = new URLSearchParams()
    if (key !== 'all') sp.set('status', key)
    if (mobileView === 'calendar') sp.set('view', 'calendar')
    return `/app/h/trips${sp.toString() ? `?${sp}` : ''}`
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams()
    if (status !== 'all') sp.set('status', status)
    if (p !== 1) sp.set('page', String(p))
    return `/app/h/trips${sp.toString() ? `?${sp}` : ''}`
  }

  // v27.6.3.2 — Cards | Calendar mobile toggle. Preserves status + ym
  // through the switch (matches /app/trips guide-side helper).
  function viewHref(target: 'cards' | 'calendar'): string {
    const sp = new URLSearchParams()
    if (status !== 'all') sp.set('status', status)
    if (target === 'calendar') sp.set('view', 'calendar')
    if (params.ym) sp.set('ym', params.ym)
    return `/app/h/trips${sp.toString() ? `?${sp}` : ''}`
  }

  const heroSub = `${total} ${total === 1 ? 'trip' : 'trips'}${
    status !== 'all' ? ` · ${STATUSES.find((s) => s.key === status)?.label}` : ''
  }`

  return (
    <main className="bb-app-main">
      {/* v27.6.3 — banner parity with /app/trips (guide side). */}
      <DashboardHero
        eyebrow="Your trips"
        title="My trips"
        subtitle={heroSub}
        bgImage="/banners/trips-hero.png"
        eyebrowColor="copper"
        showShield={false}
        objectPosition="top"
      />

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

      {/* v27.6.3.2 — mobile-only Cards | Calendar tab toggle. Hidden
          on desktop where both columns render side-by-side via the
          .bb-trips-grid CSS. */}
      <div className="bb-cal-view-tabs" role="tablist" aria-label="Trips view">
        <Link
          href={viewHref('cards')}
          role="tab"
          aria-selected={mobileView === 'cards'}
          className={`bb-chip ${mobileView === 'cards' ? 'is-active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <LayoutList size={14} aria-hidden="true" />
          Cards
        </Link>
        <Link
          href={viewHref('calendar')}
          role="tab"
          aria-selected={mobileView === 'calendar'}
          className={`bb-chip ${mobileView === 'calendar' ? 'is-active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <CalendarDays size={14} aria-hidden="true" />
          Calendar
        </Link>
      </div>

      {/* v27.6.3.2 — 2-col on desktop. LEFT = chip-filtered hunter
          trip cards. RIGHT = monthly calendar (read-only — hunters
          don't create trips). Mobile renders only the active view
          via .is-view-* class. */}
      <div className={`bb-trips-grid mt-4 is-view-${mobileView}`}>
        <section>
          <div className="bb-net-section-head">
            <span className="bb-net-section-icon" aria-hidden="true">
              <Bookmark size={14} />
            </span>
            <span className="bb-net-section-title">
              {status === 'all' ? 'All trips' : (STATUSES.find((s) => s.key === status)?.label ?? 'Trips')}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="bb-empty">
              <div className="bb-empty-title">No trips match this filter</div>
              <p className="bb-empty-sub">
                {status === 'all'
                  ? 'Your guide will add you to a trip when they are ready.'
                  : 'Try another status or clear the filter.'}
              </p>
              {status !== 'all' && (
                <Link href="/app/h/trips" className="bb-btn-secondary mt-3 inline-flex">
                  Show all trips
                </Link>
              )}
            </div>
          ) : (
            <div role="list" className="flex flex-col gap-4">
              {rows.map((t) => (
                <div role="listitem" key={t.id}>
                  <HunterTripRow
                    trip={t}
                    hunters={t.hunters}
                    rating={t.rating}
                    pendingCount={pendingByTripId.get(t.id) ?? 0}
                  />
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

        {/* v27.6.3.2 — calendar column (read-only). basePath +
            tripDetailBasePath route the prev/next/today nav and the
            bar Links to the hunter routes. */}
        <aside className="bb-trips-grid-aside bb-col-divider">
          <TripsCalendar
            trips={calendarTrips}
            year={calYear}
            month={calMonth}
            status={status}
            view={mobileView}
            basePath="/app/h/trips"
            tripDetailBasePath="/app/h/trips"
          />
        </aside>
      </div>
    </main>
  )
}
