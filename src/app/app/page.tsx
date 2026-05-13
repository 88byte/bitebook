import Link from 'next/link'
import {
  Plus,
  UserPlus,
  Upload,
  ArrowRight,
  Users,
  Calendar,
  Trophy,
  PenLine,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireGuide } from './_lib/auth'
import {
  fetchRecentTrips,
  fetchDashboardStats,
  fetchUpcomingTrips,
} from './_lib/queries'
import { createClient } from '@/lib/supabase/server'
import TripRow from './_components/TripRow'
import DashboardHero from './_components/DashboardHero'

// v27.1.5.1.1: legacy /app/welcome G0 checklist + OnboardingBanner removed.
// First-time guide setup is now exclusively the /app/onboarding wizard
// (gated by guide_profiles.onboarded_at via requireGuide()). Once the
// guide hits the dashboard at all, they're definitionally past
// onboarding — no need for a banner here.

// v27.0a.9: dashboard rebuilt to Flavio's mockup. Hero banner with the new
// bb-dashboard-hero.png + 3-card Quick Actions row, single Pending Invites
// card, 3 stat cards with icons, and bare Upcoming + Recent sections (no
// Widget tile wrapper — just an eyebrow head + "View all" link + TripRow
// stack). Onboarding banner stays above the grid for non-onboarded users.
import OutfitterDashboard from './_components/OutfitterDashboard'

export default async function DashboardPage() {
  const { profile, guide } = await requireGuide()

  // v28.1.0b — outfitter dashboard variant. Owners + admins see a
  // different surface focused on org-level navigation. Solo guides
  // (account_tier='guide' or null) fall through to the existing
  // dashboard below.
  if (
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    profile.current_outfitter_org_id
  ) {
    return <OutfitterDashboard orgId={profile.current_outfitter_org_id} viewer={{ id: profile.id, name: profile.display_name }} />
  }

  // v27.5.0 — pull default_signature_path inline so the warden-share
  // setup banner only renders when the guide hasn't saved one yet.
  // Cheap single-row read; doesn't justify extending requireGuide().
  const sb = await createClient()
  const sigQuery = sb
    .from('guide_profiles')
    .select('default_signature_path')
    .eq('user_id', profile.id)
    .maybeSingle()

  const [recent, stats, upcoming, sigRow] = await Promise.all([
    fetchRecentTrips(profile.id),
    fetchDashboardStats(profile.id),
    fetchUpcomingTrips(profile.id, 5),
    sigQuery,
  ])

  const greetingName = guide?.business_name?.trim() || profile.display_name
  const upcomingCount = upcoming.length
  const needsSignature = !sigRow.data?.default_signature_path

  return (
    <main className="bb-app-main">
      {/* v27.3.6: showShield={false} — Flavio doesn't want the antler
          shield on the dashboard banner. Banner stays clean. */}
      <DashboardHero
        eyebrow="Welcome back"
        title={greetingName}
        subtitle={
          upcomingCount === 0
            ? 'You have no upcoming trips.'
            : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? '' : 's'}.`
        }
        showShield={false}
        bgImage="/banners/dashboard-hero.png"
        objectPosition="top"
      />

      {/* v27.5.0 — warden share signature banner. Shown to existing
          guides whose default_signature_path is null (i.e. they
          onboarded BEFORE v27.5.0's Step 4). Once they save a
          signature in Settings, this disappears on next render. New
          onboards never see it (the wizard collects it). */}
      {needsSignature && (
        <Link
          href="/app/settings?tab=profile#signature"
          className="bb-tile mt-4"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            textDecoration: 'none',
            background: 'rgba(168, 92, 50, 0.08)',
            borderColor: 'rgba(168, 92, 50, 0.25)',
            color: 'var(--color-ink)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 999,
              background: 'rgba(168, 92, 50, 0.18)',
              color: 'var(--color-copper)',
            }}
          >
            <PenLine size={16} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>
              Save your signature for warden sharing
            </strong>
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
              We&rsquo;ll auto-sign your hunt logs whenever you tap Share with warden.
            </span>
          </span>
          <ArrowRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-copper)' }} />
        </Link>
      )}

      {/* v27.3.3: divider after hero, before content. */}
      <div className="bb-page-divider mt-4" aria-hidden="true" />

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

      {/* v27.3.3: removed pending-invites widget per Flavio. */}

      {/* Stats trio */}
      <div className="bb-stat-row mt-3">
        <StatIconedCard icon={Calendar} value={stats.tripsThisYear} label="Trips this year" />
        <StatIconedCard icon={Users} value={stats.huntersServed} label="Hunters served" />
        <StatIconedCard icon={Trophy} value={stats.harvests} label="Harvests" />
      </div>

      {/* v27.3.1: Upcoming + Recent now sit side-by-side at >=1280px via
          .bb-dash-pair. Mobile keeps the existing single-column stack.
          Real desktop dashboards put the two trip lists in parallel
          rails so the page reads as a status board, not a long scroll. */}
      <div className="bb-dash-pair mt-5">
        <section>
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

        <section className="bb-col-divider">
          <div className="bb-dash-section-head">
            <span className="bb-dash-section-title">Recent trips</span>
            {recent.length > 0 && (
              <Link href="/app/trips" className="bb-text-action bb-text-action-copper">
                View all
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            // v27.1.1.0.3e.5: empty-state CTA dropped — Quick Actions widget
            // at the top of the dashboard already exposes "Add trip" so the
            // duplicate "Log your first trip" button here was clutter.
            <div className="bb-empty">
              <div className="bb-empty-title">No wrapped trips yet</div>
              <p className="bb-empty-sub">
                Bite Book is built around trips — each ties hunters, tags, and harvests to one record.
              </p>
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
      </div>
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
