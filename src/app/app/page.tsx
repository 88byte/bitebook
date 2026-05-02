import Link from 'next/link'
import {
  Plus,
  UserPlus,
  Upload,
  ArrowRight,
  Users,
  Calendar,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireGuide } from './_lib/auth'
import {
  fetchRecentTrips,
  fetchDashboardStats,
  fetchUpcomingTrips,
  fetchPendingInviteCount,
} from './_lib/queries'
import { fetchOnboardingProgress, isOnboarded } from './_lib/onboarding'
import TripRow from './_components/TripRow'
import OnboardingBanner from './_components/OnboardingBanner'
import DashboardHero from './_components/DashboardHero'

// v27.0a.9: dashboard rebuilt to Flavio's mockup. Hero banner with the new
// bb-dashboard-hero.png + 3-card Quick Actions row, single Pending Invites
// card, 3 stat cards with icons, and bare Upcoming + Recent sections (no
// Widget tile wrapper — just an eyebrow head + "View all" link + TripRow
// stack). Onboarding banner stays above the grid for non-onboarded users.
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
  const showBanner = !isOnboarded(progress)
  const upcomingCount = upcoming.length

  return (
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Welcome back"
        title={greetingName}
        subtitle={
          upcomingCount === 0
            ? 'You have no upcoming trips.'
            : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? '' : 's'}.`
        }
      />

      {showBanner && <div className="mt-4"><OnboardingBanner progress={progress} /></div>}

      {/* Quick Actions */}
      <h2 className="bb-dash-section-title mt-4">Quick Actions</h2>
      <div className="bb-quick-row mt-2">
        <QuickActionCard
          href="/app/trips/new"
          icon={Plus}
          title="Add trip"
          sub="Plan a new adventure"
        />
        <QuickActionCard
          href="/app/hunters"
          icon={UserPlus}
          title="Add hunter"
          sub="Invite or add a hunter"
        />
        <QuickActionCard
          href="/app/docs"
          icon={Upload}
          title="Upload doc"
          sub="Add permits or docs"
        />
      </div>

      {/* Pending invites */}
      <Link href="/app/hunters" className="bb-pending-card mt-3" aria-label="Manage hunters">
        <div className="bb-pending-left">
          <span className="bb-pending-icon" aria-hidden="true">
            <Users size={20} />
          </span>
          <span className="bb-pending-meta">
            <span className="bb-pending-count">{pendingInvites}</span>
            <span className="bb-pending-label">
              {pendingInvites === 1 ? 'invite waiting' : 'invites waiting'}
            </span>
          </span>
        </div>
        <span
          className="bb-text-action bb-text-action-copper"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          Manage hunters
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </Link>

      {/* Stats trio */}
      <div className="bb-stat-row mt-3">
        <StatIconedCard icon={Calendar} value={stats.tripsThisYear} label="Trips this year" />
        <StatIconedCard icon={Users} value={stats.huntersServed} label="Hunters served" />
        <StatIconedCard icon={Trophy} value={stats.harvests} label="Harvests" />
      </div>

      {/* Upcoming */}
      <section className="mt-5">
        <div className="bb-dash-section-head">
          <span className="bb-dash-section-title">Upcoming</span>
          {upcoming.length > 0 && (
            <Link href="/app/trips" className="bb-text-action bb-text-action-copper">
              View all
            </Link>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">Nothing on the books</div>
            <p className="bb-empty-sub">Plan a trip to see it appear here.</p>
          </div>
        ) : (
          <div role="list" className="flex flex-col gap-3">
            {upcoming.slice(0, 3).map((t) => (
              <div role="listitem" key={t.id}>
                <TripRow
                  trip={t}
                  hunters={t.hunters}
                  rating={t.rating}
                  reviewCount={t.reviewCount}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent trips */}
      <section className="mt-5">
        <div className="bb-dash-section-head">
          <span className="bb-dash-section-title">Recent trips</span>
          {recent.length > 0 && (
            <Link href="/app/trips" className="bb-text-action bb-text-action-copper">
              View all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No wrapped trips yet</div>
            <p className="bb-empty-sub">
              Bite Book is built around trips — each ties hunters, tags, and harvests to one record.
            </p>
            <Link href="/app/trips/new" className="bb-cta-sm mt-3 inline-flex">
              <Plus size={16} aria-hidden="true" />
              Log your first trip
            </Link>
          </div>
        ) : (
          <div role="list" className="flex flex-col gap-3">
            {recent.slice(0, 3).map((t) => (
              <div role="listitem" key={t.id}>
                <TripRow
                  trip={t}
                  hunters={t.hunters}
                  rating={t.rating}
                  reviewCount={t.reviewCount}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function QuickActionCard({
  href,
  icon: Icon,
  title,
  sub,
}: {
  href: string
  icon: LucideIcon
  title: string
  sub: string
}) {
  return (
    <Link href={href} className="bb-quick-card">
      <span className="bb-quick-card-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="bb-quick-card-title">{title}</span>
      <span className="bb-quick-card-sub">{sub}</span>
      <span className="bb-quick-card-arrow" aria-hidden="true">
        <ArrowRight size={14} />
      </span>
    </Link>
  )
}

function StatIconedCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon
  value: number
  label: string
}) {
  return (
    <div className="bb-stat-card-iconed">
      <span className="bb-stat-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="bb-stat-text">
        <span className="v">{value}</span>
        <span className="l">{label}</span>
      </span>
    </div>
  )
}
