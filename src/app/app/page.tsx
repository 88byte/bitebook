import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireGuide } from './_lib/auth'
import TripRow from './_components/TripRow'

const RECENT_LIMIT = 10

export default async function DashboardPage() {
  const { supabase, profile, guide } = await requireGuide()

  // Recent trips (last 10) for this guide. Pull aggregate counts in one
  // round-trip via a select-count subquery on the related rows, so the row
  // component can stay dumb. Supabase's PostgREST count syntax `relation(*)`
  // returns an array; we collapse it to a number client-side.
  const { data: trips } = await supabase
    .from('trips')
    .select(`
      id, title, status, starts_at, ends_at, location_name, kind,
      trip_participants(count),
      harvests(count)
    `)
    .eq('guide_id', profile.id)
    .order('starts_at', { ascending: false })
    .limit(RECENT_LIMIT)

  const recent = (trips ?? []).map((t) => {
    const tp = t.trip_participants as unknown as { count: number }[] | null
    const hv = t.harvests as unknown as { count: number }[] | null
    return {
      ...t,
      hunters: tp?.[0]?.count ?? 0,
      harvests: hv?.[0]?.count ?? 0,
    }
  })

  // Stats — calendar-year bucket since trips.season doesn't exist in this
  // schema. "Hunters served" = distinct trip_participants this year (across
  // all of this guide's trips). "Harvests" = sum(quantity) this year.
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [{ count: tripsThisSeason }, hunterRows, harvestRows] = await Promise.all([
    supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('guide_id', profile.id)
      .gte('starts_at', yearStart),
    supabase
      .from('trip_participants')
      .select('hunter_id, guest_name, trips!inner(guide_id, starts_at)')
      .eq('trips.guide_id', profile.id)
      .gte('trips.starts_at', yearStart),
    supabase
      .from('harvests')
      .select('quantity, trips!inner(guide_id, starts_at)')
      .eq('trips.guide_id', profile.id)
      .gte('trips.starts_at', yearStart),
  ])

  const huntersServed = new Set(
    (hunterRows.data ?? []).map((r) => r.hunter_id ?? `guest:${r.guest_name ?? ''}`)
  ).size
  const harvestTotal = (harvestRows.data ?? []).reduce((acc, r) => acc + (r.quantity ?? 0), 0)

  const greetingName = guide?.business_name?.trim() || profile.display_name
  const isEmpty = recent.length === 0

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="bb-page-eyebrow">Welcome back</p>
          <h1 className="bb-page-title">{greetingName}</h1>
          <p className="bb-page-sub">
            {isEmpty
              ? 'Start your first trip to begin logging hunts.'
              : `You have ${recent.length} recent ${recent.length === 1 ? 'trip' : 'trips'}.`}
          </p>
        </div>
        <Link href="/app/trips/new" className="bb-cta-sm" aria-label="Create new trip">
          <Plus size={16} aria-hidden="true" />
          New trip
        </Link>
      </header>

      <section aria-labelledby="dash-stats">
        <h2 id="dash-stats" className="sr-only">Season stats</h2>
        <div className="bb-stat-grid mt-4">
          <Stat label="Trips · this year" value={tripsThisSeason ?? 0} />
          <Stat label="Hunters served" value={huntersServed} />
          <Stat label="Harvests" value={harvestTotal} />
        </div>
      </section>

      <section aria-labelledby="dash-recent">
        <h2 id="dash-recent" className="bb-section-title">Recent trips</h2>
        {isEmpty ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No trips yet</div>
            <p className="bb-empty-sub">
              Bite Book is built around trips. Each trip ties hunters, tags, and harvests to one
              record you can hand to a warden in a tap.
            </p>
            <Link href="/app/trips/new" className="bb-cta-sm mt-3 inline-flex">
              <Plus size={16} aria-hidden="true" />
              Log your first trip
            </Link>
          </div>
        ) : (
          <div role="list">
            {recent.map((t) => (
              <div role="listitem" key={t.id}>
                <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
              </div>
            ))}
            <div className="mt-3 text-right">
              <Link
                href="/app/trips"
                className="text-sm font-semibold"
                style={{ color: 'var(--color-copper)' }}
              >
                See all trips →
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bb-stat-card">
      <div className="bb-stat-value">{value}</div>
      <div className="bb-stat-label">{label}</div>
    </div>
  )
}
