import Link from 'next/link'
import { Calendar, Trophy, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireHunter } from '../_lib/auth'
import {
  fetchHunterUpcomingTrips,
  fetchHunterRecentTrips,
  fetchHunterStats,
} from '../_lib/queries'
import { fetchHunterOnboardingProgress, isHunterOnboarded } from '../_lib/onboarding'
import HunterTripRow from './_components/HunterTripRow'
import HunterOnboardingBanner from './_components/HunterOnboardingBanner'
import DashboardHero from '../_components/DashboardHero'

// v27.0a.9: hunter dashboard mirror of the guide rebuild — same hero +
// stat trio + section pattern. No Quick Actions / Pending Invites cards
// (hunters can't create trips or send invites — guides do that).
export default async function HunterDashboardPage() {
  const { supabase, user, profile } = await requireHunter()

  const [upcoming, recent, stats, progress] = await Promise.all([
    fetchHunterUpcomingTrips(profile.id),
    fetchHunterRecentTrips(profile.id),
    fetchHunterStats(profile.id),
    fetchHunterOnboardingProgress(supabase, user.id),
  ])

  const showBanner = !isHunterOnboarded(progress)
  const upcomingCount = upcoming.length

  return (
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Welcome"
        title={profile.display_name}
        subtitle={
          upcomingCount === 0
            ? 'You have no upcoming trips.'
            : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? '' : 's'}.`
        }
      />

      {showBanner && (
        <div className="mt-4">
          <HunterOnboardingBanner progress={progress} />
        </div>
      )}

      <div className="bb-stat-row mt-4">
        <StatIconedCard icon={Calendar} value={stats.trips} label="Trips you've been on" />
        <StatIconedCard icon={Trophy} value={stats.harvests} label="Harvests" />
        <StatIconedCard icon={Users} value={stats.guides} label="Guides" />
      </div>

      <section className="mt-5">
        <div className="bb-dash-section-head">
          <span className="bb-dash-section-title">Upcoming trips</span>
          {upcoming.length > 0 && (
            <Link href="/app/h/trips" className="bb-text-action bb-text-action-copper">
              View all
            </Link>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No upcoming trips</div>
            <p className="bb-empty-sub">
              Your guide will add you to a trip when they are ready. You will get an email when they do.
            </p>
          </div>
        ) : (
          <div role="list" className="flex flex-col gap-3">
            {upcoming.map((t) => (
              <div role="listitem" key={t.id}>
                <HunterTripRow trip={t} hunters={t.hunters} rating={t.rating} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <div className="bb-dash-section-head">
          <span className="bb-dash-section-title">Recent trips</span>
          {recent.length > 0 && (
            <Link
              href="/app/h/trips?status=completed"
              className="bb-text-action bb-text-action-copper"
            >
              View all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No wrapped trips yet</div>
            <p className="bb-empty-sub">
              Once your guide wraps a hunt, it will show up here so you can leave a review.
            </p>
          </div>
        ) : (
          <div role="list" className="flex flex-col gap-3">
            {recent.map((t) => (
              <div role="listitem" key={t.id}>
                <HunterTripRow trip={t} hunters={t.hunters} rating={t.rating} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
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
