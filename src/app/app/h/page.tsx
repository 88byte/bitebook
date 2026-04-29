import Link from 'next/link'
import { requireHunter } from '../_lib/auth'
import {
  fetchHunterUpcomingTrips,
  fetchHunterRecentTrips,
  fetchHunterStats,
} from '../_lib/queries'
import { fetchHunterOnboardingProgress, isHunterOnboarded } from '../_lib/onboarding'
import Widget from '../_components/Widget'
import HunterTripRow from './_components/HunterTripRow'
import HunterOnboardingBanner from './_components/HunterOnboardingBanner'

// v25.1: hunter dashboard. Stats row + recent trips. Hunters don't create
// trips, so there are no add-trip CTAs here — guides do that.
//
// v26.0 Batch A: shows a HunterOnboardingBanner at the top of the grid when
// onboarding is incomplete (3-step checklist on /app/h/welcome).
//
// v26.5.7: matched to the guide dashboard structure — Upcoming widget
// (planned/active by date) AND Recent widget (wrapped trips by updated_at).
// Dropped the "Your guides" widget per Flavio: guides remain accessible via
// the dedicated /app/h/guides tab.
export default async function HunterDashboardPage() {
  const { supabase, user, profile } = await requireHunter()

  const [upcoming, recent, stats, progress] = await Promise.all([
    fetchHunterUpcomingTrips(profile.id),
    fetchHunterRecentTrips(profile.id),
    fetchHunterStats(profile.id),
    fetchHunterOnboardingProgress(supabase, user.id),
  ])

  const isEmpty = upcoming.length === 0 && recent.length === 0
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
            title="Upcoming trips"
            action={
              upcoming.length > 0 ? (
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
            {upcoming.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No upcoming trips</div>
                <p className="bb-empty-sub">
                  Your guide will add you to a trip when they are ready. You will get an email when they do.
                </p>
              </div>
            ) : (
              <div role="list" className="flex flex-col gap-4">
                {upcoming.map((t) => (
                  <div role="listitem" key={t.id}>
                    <HunterTripRow trip={t} hunters={t.hunters} harvests={t.harvests} rating={t.rating} />
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>

        <div className="bb-dash-cell-12" data-order-mobile="3">
          <Widget
            title="Recent trips"
            action={
              recent.length > 0 ? (
                <Link
                  href="/app/h/trips?status=completed"
                  className="bb-widget-link"
                  style={{ color: 'var(--color-copper)' }}
                >
                  See all
                </Link>
              ) : null
            }
          >
            {recent.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No wrapped trips yet</div>
                <p className="bb-empty-sub">
                  Once your guide wraps a hunt, it will show up here so you can leave a review.
                </p>
              </div>
            ) : (
              <div role="list" className="flex flex-col gap-4">
                {recent.map((t) => (
                  <div role="listitem" key={t.id}>
                    <HunterTripRow trip={t} hunters={t.hunters} harvests={t.harvests} rating={t.rating} />
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
