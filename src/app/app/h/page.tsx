import Link from 'next/link'
import { requireHunter } from '../_lib/auth'
import { fetchHunterTrips, fetchHunterStats } from '../_lib/queries'
import { fetchHunterOnboardingProgress, isHunterOnboarded } from '../_lib/onboarding'
import Widget from '../_components/Widget'
import HunterTripRow from './_components/HunterTripRow'
import HunterOnboardingBanner from './_components/HunterOnboardingBanner'

// v25.1: hunter dashboard. Stats row + recent trips. Hunters don't create
// trips, so there are no add-trip CTAs here — guides do that.
//
// v26.0 Batch A: shows a HunterOnboardingBanner at the top of the grid when
// onboarding is incomplete (3-step checklist on /app/h/welcome).
export default async function HunterDashboardPage() {
  const { supabase, user, profile } = await requireHunter()

  const [recent, stats, progress] = await Promise.all([
    fetchHunterTrips(profile.id, 5),
    fetchHunterStats(profile.id),
    fetchHunterOnboardingProgress(supabase, user.id),
  ])

  const isEmpty = recent.length === 0
  const showBanner = !isHunterOnboarded(progress)

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Welcome</p>
        <h1 className="bb-page-title">{profile.display_name}</h1>
        <p className="bb-page-sub">
          {isEmpty
            ? 'No trips yet. Your guide will add you to a trip when they are ready.'
            : `You have been on ${stats.trips} ${stats.trips === 1 ? 'trip' : 'trips'}.`}
        </p>
      </header>

      <div className="bb-dash-grid mt-4">
        {showBanner && (
          <div className="bb-dash-cell-12" data-order-mobile="0">
            <HunterOnboardingBanner progress={progress} />
          </div>
        )}

        <section
          aria-labelledby="hunter-stats"
          className="bb-dash-cell-12"
          data-order-mobile="1"
        >
          <h2 id="hunter-stats" className="sr-only">Your stats</h2>
          <div className="bb-stat-grid">
            <Stat label="Trips you've been on" value={stats.trips} />
            <Stat label="Harvests" value={stats.harvests} />
            <Stat label="Guides" value={stats.guides} />
          </div>
        </section>

        <div className="bb-dash-cell-12" data-order-mobile="2">
          <Widget
            title="Recent trips"
            action={
              !isEmpty ? (
                <Link
                  href="/app/h/trips"
                  className="bb-widget-link"
                  style={{ color: 'var(--color-copper)' }}
                >
                  See all
                </Link>
              ) : null
            }
          >
            {isEmpty ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No trips yet</div>
                <p className="bb-empty-sub">
                  Your guide will add you to a trip when they are ready. You will get an email when they do.
                </p>
              </div>
            ) : (
              <div role="list">
                {recent.map((t) => (
                  <div role="listitem" key={t.id}>
                    <HunterTripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>
      </div>
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
