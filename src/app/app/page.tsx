import Link from 'next/link'
import { Plus, UserPlus, Upload, ArrowRight } from 'lucide-react'
import { requireGuide } from './_lib/auth'
import {
  fetchRecentTrips,
  fetchDashboardStats,
  fetchUpcomingTrips,
  fetchPendingInviteCount,
} from './_lib/queries'
import { fetchOnboardingProgress, isOnboarded } from './_lib/onboarding'
import TripRow from './_components/TripRow'
import Widget from './_components/Widget'
import OnboardingBanner from './_components/OnboardingBanner'

export default async function DashboardPage() {
  const { supabase, user, profile, guide } = await requireGuide()

  const [recent, stats, upcoming, pendingInvites, progress] = await Promise.all([
    fetchRecentTrips(profile.id),
    fetchDashboardStats(profile.id),
    fetchUpcomingTrips(profile.id, 5),
    fetchPendingInviteCount(profile.id),
    fetchOnboardingProgress(supabase, user.id),
  ])

  const greetingName = guide?.business_name?.trim() || profile.display_name
  const isEmpty = recent.length === 0
  const showBanner = !isOnboarded(progress)
  // v25.1: the v24.1 hideNewTripCtas dedupe was an over-correction. Both the
  // OnboardingBanner (which routes to /app/welcome — a guided checklist) and
  // Quick Actions (which jumps straight to /app/trips/new) intentionally
  // expose distinct paths. Restore all three quick actions and the dedicated
  // empty-state CTA, and drop the duplicate header "+ New trip" button —
  // Quick Actions owns that CTA on the dashboard now.
  // v26.1.2: dashboard reordered so Upcoming Trips renders above Recent
  // Trips — guides care more about what's NEXT than what's already done.
  // Documents widget removed (reachable via mobile drawer / desktop sidebar
  // / Docs nav, no longer warrants its own dashboard tile).

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Welcome back</p>
        <h1 className="bb-page-title">{greetingName}</h1>
        <p className="bb-page-sub">
          {isEmpty
            ? 'Start your first trip to begin logging hunts.'
            : `You have ${recent.length} recent ${recent.length === 1 ? 'trip' : 'trips'}.`}
        </p>
      </header>

      <div className="bb-dash-grid mt-4">
        {showBanner && (
          <div className="bb-dash-cell-12" data-order-mobile="1">
            <OnboardingBanner progress={progress} />
          </div>
        )}

        <div className="bb-dash-cell-4" data-order-mobile="2">
          <Widget title="Quick actions">
            <div className="bb-quick-actions">
              <Link href="/app/trips/new" className="bb-btn-secondary">
                <Plus size={16} aria-hidden="true" />
                Add trip
              </Link>
              <Link href="/app/hunters" className="bb-btn-secondary">
                <UserPlus size={16} aria-hidden="true" />
                Add hunter
              </Link>
              <Link href="/app/docs" className="bb-btn-secondary">
                <Upload size={16} aria-hidden="true" />
                Upload doc
              </Link>
            </div>
          </Widget>
        </div>

        <div className="bb-dash-cell-4" data-order-mobile="3">
          <Widget title="Pending invites">
            <div className="bb-widget-stat">
              <div className="bb-stat-value">{pendingInvites}</div>
              <div className="bb-stat-label">
                {pendingInvites === 1 ? 'invite waiting' : 'invites waiting'}
              </div>
            </div>
            <Link
              href="/app/hunters"
              className="bb-widget-link mt-3 inline-flex items-center gap-1"
              style={{ color: 'var(--color-copper)' }}
            >
              Manage hunters
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Widget>
        </div>

        <section
          aria-labelledby="dash-stats"
          className="bb-dash-cell-12"
          data-order-mobile="4"
        >
          <h2 id="dash-stats" className="sr-only">Season stats</h2>
          <div className="bb-stat-grid">
            <Stat label="Trips, this year" value={stats.tripsThisYear} />
            <Stat label="Hunters served" value={stats.huntersServed} />
            <Stat label="Harvests" value={stats.harvests} />
          </div>
        </section>

        {/* v26.1.2: Upcoming above Recent on both mobile and desktop. */}
        <div className="bb-dash-cell-7" data-order-mobile="5">
          <Widget title="Upcoming">
            {upcoming.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">Nothing on the books</div>
                <p className="bb-empty-sub">
                  Plan a trip to see it appear here.
                </p>
              </div>
            ) : (
              <div role="list" className="flex flex-col gap-4">
                {upcoming.map((t) => (
                  <div role="listitem" key={t.id}>
                    <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} rating={t.rating} reviewCount={t.reviewCount} />
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>

        <div className="bb-dash-cell-5" data-order-mobile="6">
          <Widget
            title="Recent trips"
            action={
              !isEmpty ? (
                <Link
                  href="/app/trips"
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
                  Bite Book is built around trips. Each trip ties hunters, tags, and harvests to one
                  record you can hand to a warden in a tap.
                </p>
                <Link href="/app/trips/new" className="bb-cta-sm mt-3 inline-flex">
                  <Plus size={16} aria-hidden="true" />
                  Log your first trip
                </Link>
              </div>
            ) : (
              <div role="list" className="flex flex-col gap-4">
                {recent.slice(0, 5).map((t) => (
                  <div role="listitem" key={t.id}>
                    <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} rating={t.rating} reviewCount={t.reviewCount} />
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
