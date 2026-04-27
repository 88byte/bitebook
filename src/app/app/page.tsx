import Link from 'next/link'
import { Plus, UserPlus, FileText, ArrowRight } from 'lucide-react'
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

      <div className="bb-dash-grid mt-4">
        {showBanner && (
          <div className="bb-dash-cell-12">
            <OnboardingBanner progress={progress} />
          </div>
        )}

        <section aria-labelledby="dash-stats" className="bb-dash-cell-12">
          <h2 id="dash-stats" className="sr-only">Season stats</h2>
          <div className="bb-stat-grid">
            <Stat label="Trips, this year" value={stats.tripsThisYear} />
            <Stat label="Hunters served" value={stats.huntersServed} />
            <Stat label="Harvests" value={stats.harvests} />
          </div>
        </section>

        <div className="bb-dash-cell-7">
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
              <div role="list">
                {recent.slice(0, 5).map((t) => (
                  <div role="listitem" key={t.id}>
                    <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>

        <div className="bb-dash-cell-5">
          <Widget title="Upcoming">
            {upcoming.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">Nothing on the books</div>
                <p className="bb-empty-sub">
                  Plan a trip to see it appear here.
                </p>
              </div>
            ) : (
              <div role="list">
                {upcoming.map((t) => (
                  <div role="listitem" key={t.id}>
                    <TripRow trip={t} hunters={t.hunters} harvests={t.harvests} />
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>

        <div className="bb-dash-cell-4">
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

        <div className="bb-dash-cell-4">
          <Widget title="Quick actions">
            <div className="bb-quick-actions">
              <Link href="/app/trips/new" className="bb-cta-sm">
                <Plus size={16} aria-hidden="true" />
                New trip
              </Link>
              <Link href="/app/hunters" className="bb-btn-secondary">
                <UserPlus size={16} aria-hidden="true" />
                Invite hunter
              </Link>
            </div>
          </Widget>
        </div>

        <div className="bb-dash-cell-4">
          <Widget title="Documents">
            <div className="bb-doc-shelf">
              <FileText size={28} aria-hidden="true" style={{ color: 'var(--color-ink-soft)' }} />
              <p className="bb-empty-sub mt-2" style={{ marginLeft: 0, marginRight: 0 }}>
                Custom doc upload, hunter wallet, and warden share are coming in v25.
              </p>
            </div>
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
