import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchTripsPage } from '../_lib/queries'
import TripRow from '../_components/TripRow'
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

export default async function TripsListPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const params = await searchParams

  const statusParam = params.status as TripStatus | 'all' | undefined
  const status: TripStatus | 'all' =
    statusParam && STATUSES.some((s) => s.key === statusParam) ? statusParam : 'all'

  const page = Math.max(1, Number(params.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { rows, total } = await fetchTripsPage(profile.id, { status, from, to })
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

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="bb-page-eyebrow">All trips</p>
          <h1 className="bb-page-title">Trips</h1>
          <p className="bb-page-sub">
            {total} {total === 1 ? 'trip' : 'trips'}
            {status !== 'all' ? ` · ${STATUSES.find((s) => s.key === status)?.label}` : ''}
          </p>
        </div>
        <Link href="/app/trips/new" className="bb-cta-sm" aria-label="Create new trip">
          <Plus size={16} aria-hidden="true" />
          New trip
        </Link>
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
          <div role="list">
            {rows.map((t) => (
              <div role="listitem" key={t.id}>
                <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
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
