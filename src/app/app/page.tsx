import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireGuide } from './_lib/auth'
import { fetchRecentTrips, fetchDashboardStats } from './_lib/queries'
import TripRow from './_components/TripRow'

export default async function DashboardPage() {
  const { profile, guide } = await requireGuide()

  const [recent, stats] = await Promise.all([
    fetchRecentTrips(profile.id),
    fetchDashboardStats(profile.id),
  ])

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
          <Stat label="Trips · this year" value={stats.tripsThisYear} />
          <Stat label="Hunters served" value={stats.huntersServed} />
          <Stat label="Harvests" value={stats.harvests} />
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
