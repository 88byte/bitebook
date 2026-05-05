import Link from 'next/link'
import { Calendar, Trophy, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireHunter } from '../_lib/auth'
import {
  fetchHunterUpcomingTrips,
  fetchHunterRecentTrips,
  fetchHunterStats,
  fetchHunterPendingWalletLinks,
} from '../_lib/queries'
import { fetchHunterOnboardingProgress, isHunterOnboarded } from '../_lib/onboarding'
import { fetchHunterPendingActions } from '../_lib/trip-doc-queries'
import HunterTripRow from './_components/HunterTripRow'
import HunterOnboardingBanner from './_components/HunterOnboardingBanner'
import PendingActionsCard from './_components/PendingActionsCard'
import DashboardHero from '../_components/DashboardHero'

// v27.0a.9: hunter dashboard mirror of the guide rebuild — same hero +
// stat trio + section pattern. No Quick Actions / Pending Invites cards
// (hunters can't create trips or send invites — guides do that).
export default async function HunterDashboardPage() {
  const { supabase, user, profile } = await requireHunter()

  const [upcoming, recent, stats, progress, pendingActions, pendingWalletLinks] = await Promise.all([
    fetchHunterUpcomingTrips(profile.id),
    fetchHunterRecentTrips(profile.id),
    fetchHunterStats(profile.id),
    fetchHunterOnboardingProgress(supabase, user.id),
    fetchHunterPendingActions(profile.id),
    fetchHunterPendingWalletLinks(profile.id),
  ])

  // v27.1.3.0.6 — pending-link counts per trip drive the small "Action
  // needed" badge on each upcoming-trip card. Cross-trip pendings live
  // in the PendingActionsCard tile below, but on the row itself we just
  // need a number so the hunter can spot which trip needs attention.
  const pendingByTripId = new Map<string, number>()
  for (const w of pendingWalletLinks) {
    pendingByTripId.set(w.trip_id, (pendingByTripId.get(w.trip_id) ?? 0) + 1)
  }

  const showBanner = !isHunterOnboarded(progress)
  const upcomingCount = upcoming.length

  return (
    <main className="bb-app-main">
      {/* v27.6.3 — explicit bgImage + objectPosition='top' brings the
          hunter dashboard banner in line with /app (guide dashboard).
          Was inheriting the DashboardHero default which pre-v27.6.3
          pointed at the legacy root-path /bb-dashboard-hero.png.
          v27.6.3.3 — showShield={false} drops the antler shield that
          was still appearing on the hunter dashboard banner (guide
          side dropped it in v27.3.6 item 4). */}
      <DashboardHero
        eyebrow="Welcome"
        title={profile.display_name}
        subtitle={
          upcomingCount === 0
            ? 'You have no upcoming trips.'
            : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? '' : 's'}.`
        }
        bgImage="/banners/dashboard-hero.png"
        objectPosition="top"
        showShield={false}
      />

      {showBanner && (
        <div className="mt-4">
          <HunterOnboardingBanner progress={progress} />
        </div>
      )}

      {/* v27.1.5.2: Pending actions promoted to slot 2 (right under the
          hero, ahead of stats + Upcoming). License/tag link prompts and
          trip-doc actions are the most time-sensitive thing for a hunter
          to see — they shouldn't be buried between Upcoming and Recent.
          Renders only when there's at least one pending item; otherwise
          the stats row becomes the first content tile after the hero. */}
      {(pendingActions.length > 0 || pendingWalletLinks.length > 0) && (
        <div className="mt-4">
          <PendingActionsCard
            actions={pendingActions}
            walletLinks={pendingWalletLinks}
          />
        </div>
      )}

      <div className="bb-stat-row mt-4">
        <StatIconedCard icon={Calendar} value={stats.trips} label="Trips you've been on" />
        <StatIconedCard icon={Trophy} value={stats.harvests} label="Harvests" />
        <StatIconedCard icon={Users} value={stats.guides} label="Guides" />
      </div>

      {/* v27.6.3.3 item 1 — Upcoming + Recent now sit side-by-side at
          >=1280px via .bb-dash-pair, mirroring guide /app dashboard.
          Mobile keeps the existing single-column stack. Real desktop
          dashboards put the two trip lists in parallel rails so the
          page reads as a status board, not a long scroll. */}
      <div className="bb-dash-pair mt-5">
        <section>
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
                  <HunterTripRow trip={t} hunters={t.hunters} rating={t.rating} pendingCount={pendingByTripId.get(t.id) ?? 0} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bb-col-divider">
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
                  <HunterTripRow trip={t} hunters={t.hunters} rating={t.rating} pendingCount={pendingByTripId.get(t.id) ?? 0} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
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
