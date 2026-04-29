import Link from 'next/link'
import { requireHunter } from '../../_lib/auth'
import { fetchHunterTripsPage } from '../../_lib/queries'
import HunterTripRow from '../_components/HunterTripRow'
import type { Database } from '@/lib/supabase/types'

type TripStatus = Database['public']['Enums']['trip_status']

const PAGE_SIZE = 20
const STATUSES: { key: TripStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'planned', label: 'Pre-trip' },
  { key: 'active', label: 'In field' },
  { key: 'completed', label: 'Wrapped' },
  { key: 'canceled', label: 'Canceled' },
]

type SearchParams = Promise<{ status?: string; page?: string }>

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

  const { rows, total } = await fetchHunterTripsPage(profile.id, { status, from, to })
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function chipHref(key: TripStatus | 'all') {
    const sp = new URLSearchParams()
    if (key !== 'all') sp.set('status', key)
    return `/app/h/trips${sp.toString() ? `?${sp}` : ''}`
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams()
    if (status !== 'all') sp.set('status', status)
    if (p !== 1) sp.set('page', String(p))
    return `/app/h/trips${sp.toString() ? `?${sp}` : ''}`
  }

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Your trips</p>
        <h1 className="bb-page-title">My trips</h1>
        <p className="bb-page-sub">
          {total} {total === 1 ? 'trip' : 'trips'}
          {status !== 'all' ? ` · ${STATUSES.find((s) => s.key === status)?.label}` : ''}
        </p>
      </header>

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

      <section className="mt-4">
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
                <HunterTripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
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
    </main>
  )
}
