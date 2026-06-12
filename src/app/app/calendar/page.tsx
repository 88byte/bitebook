import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import {
  fetchPersonalCalendarTrips,
  fetchOrgCalendarTrips,
  fetchOrgGuideRoster,
  type CalendarTrip,
  type CalendarTripWithSource,
} from '../_lib/calendar-queries'
import {
  GUIDE_SOURCE_COLORS,
  ORG_GUIDE_PALETTE,
  colorForGuide,
} from '../_lib/calendar-palette'

// v28.1.0f.1 Sprint 3.4b — month-view calendar. Single route serves
// three audiences (decision 2):
//   • Outfitter owner/admin: org-wide trips for current_outfitter_org_id,
//     color-coded per guide via an 8-color colorblind-safe palette.
//     Optional ?guide_id= filter narrows to one guide.
//   • Network or pure guide: their own trips, source-tagged outfitter
//     vs personal so the legend can distinguish the two.
//
// Week/day toggle deferred to 3.4c. Multi-day stripe spans deferred
// (chips render on starts_at day only). Mobile-first: at < 640px the
// 7-column grid auto-shrinks day cells; agenda fallback when the
// month has no trips at all.

type SearchParams = Promise<{
  date?: string
  guide_id?: string
}>

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}
function startOfNextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}
function startOfWeek(d: Date): Date {
  // Week starts on Sunday for the grid.
  const dow = d.getUTCDay()
  return new Date(d.getTime() - dow * MS_PER_DAY)
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}
function toYMD(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function shortDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

function parseDateParam(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const sp = await searchParams

  const anchor = parseDateParam(sp.date)
  const monthStart = startOfMonth(anchor)
  const monthEnd = startOfNextMonth(anchor)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = new Date(gridStart.getTime() + 42 * MS_PER_DAY) // 6 weeks

  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id

  const guideFilter = typeof sp.guide_id === 'string' && sp.guide_id ? sp.guide_id : null

  let orgTrips: CalendarTrip[] | null = null
  let personalTrips: CalendarTripWithSource[] | null = null
  let roster: Array<{ profile_id: string; display_name: string }> = []

  if (isOutfitterMember && profile.current_outfitter_org_id) {
    ;[orgTrips, roster] = await Promise.all([
      fetchOrgCalendarTrips(
        profile.current_outfitter_org_id,
        { startISO: gridStart.toISOString(), endISO: gridEnd.toISOString() },
        guideFilter,
      ),
      fetchOrgGuideRoster(profile.current_outfitter_org_id),
    ])
  } else {
    personalTrips = await fetchPersonalCalendarTrips(
      profile.id,
      { startISO: gridStart.toISOString(), endISO: gridEnd.toISOString() },
    )
  }

  // Bucket trips by day-of-start (UTC YMD).
  const tripsByDay = new Map<string, Array<{ id: string; title: string; color: { bg: string; fg: string }; status: string }>>()
  function pushTrip(trip: CalendarTrip | CalendarTripWithSource, color: { bg: string; fg: string }) {
    const ymd = toYMD(new Date(trip.starts_at))
    const arr = tripsByDay.get(ymd) ?? []
    arr.push({ id: trip.id, title: trip.title, color, status: trip.status })
    tripsByDay.set(ymd, arr)
  }

  if (orgTrips) {
    for (const t of orgTrips) {
      // Color by lead guide (first id in guide_ids). Fallback gray if none.
      const lead = t.guide_ids[0]
      pushTrip(t, lead ? colorForGuide(lead) : { bg: '#8A8A8A', fg: '#FFFFFF' })
    }
  } else if (personalTrips) {
    for (const t of personalTrips) {
      pushTrip(t, GUIDE_SOURCE_COLORS[t.source])
    }
  }

  // Build 42 cells.
  const cells: Array<{ date: Date; isThisMonth: boolean; ymd: string }> = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * MS_PER_DAY)
    cells.push({
      date: d,
      isThisMonth: d.getUTCMonth() === monthStart.getUTCMonth(),
      ymd: toYMD(d),
    })
  }

  const prevHref = `/app/calendar?date=${toYMD(addMonths(monthStart, -1))}${guideFilter ? `&guide_id=${guideFilter}` : ''}`
  const nextHref = `/app/calendar?date=${toYMD(addMonths(monthStart, 1))}${guideFilter ? `&guide_id=${guideFilter}` : ''}`
  const todayHref = `/app/calendar${guideFilter ? `?guide_id=${guideFilter}` : ''}`

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href="/app"
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">Schedule</p>
        <h1 className="bb-page-title">Calendar</h1>
        <p className="bb-page-sub">
          {isOutfitterMember
            ? 'Every trip across your guide network. Tap a chip to open the trip.'
            : 'Trips assigned to you. Outfitter-assigned and personal bookings are color-coded.'}
        </p>
      </header>

      {/* Month nav */}
      <div
        style={{
          marginTop: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <Link href={prevHref} aria-label="Previous month" className="bb-btn-secondary" style={{ padding: '0.45rem 0.6rem', minHeight: 38 }}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Link>
        <Link href={todayHref} className="bb-btn-secondary" style={{ padding: '0.45rem 0.85rem', minHeight: 38 }}>
          Today
        </Link>
        <Link href={nextHref} aria-label="Next month" className="bb-btn-secondary" style={{ padding: '0.45rem 0.6rem', minHeight: 38 }}>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <strong style={{ marginLeft: '0.4rem', fontSize: '1.05rem' }}>{monthLabel(monthStart)}</strong>
      </div>

      {/* Guide filter (outfitter only) */}
      {isOutfitterMember && roster.length > 0 && (
        <div
          role="group"
          aria-label="Filter by guide"
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '0.35rem',
            flexWrap: 'wrap',
            overflowX: 'auto',
            paddingBottom: '0.25rem',
          }}
        >
          <FilterChip href={`/app/calendar?date=${toYMD(monthStart)}`} active={!guideFilter} bg="#1F2419" fg="#FFFFFF">
            All guides
          </FilterChip>
          {roster.map((g) => {
            const c = colorForGuide(g.profile_id)
            return (
              <FilterChip
                key={g.profile_id}
                href={`/app/calendar?date=${toYMD(monthStart)}&guide_id=${g.profile_id}`}
                active={guideFilter === g.profile_id}
                bg={c.bg}
                fg={c.fg}
              >
                {g.display_name}
              </FilterChip>
            )
          })}
        </div>
      )}

      {/* Legend (guide view) */}
      {!isOutfitterMember && (
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            fontSize: '0.85rem',
          }}
        >
          <LegendDot bg={GUIDE_SOURCE_COLORS.outfitter.bg} label="Outfitter assigned" />
          <LegendDot bg={GUIDE_SOURCE_COLORS.personal.bg} label="Personal" />
        </div>
      )}

      {/* Grid */}
      <section
        aria-label="Calendar grid"
        style={{
          marginTop: '0.75rem',
          border: '1px solid var(--color-card-divider)',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            background: 'var(--color-paper-tint)',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--color-ink-muted)',
          }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--color-card-divider)' }}>
              {shortDayLabel(new Date(gridStart.getTime() + i * MS_PER_DAY))}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          }}
        >
          {cells.map((cell) => {
            const trips = tripsByDay.get(cell.ymd) ?? []
            return (
              <div
                key={cell.ymd}
                style={{
                  borderRight: '1px solid var(--color-card-divider)',
                  borderBottom: '1px solid var(--color-card-divider)',
                  minHeight: 92,
                  padding: '0.3rem 0.4rem',
                  background: cell.isThisMonth ? '#FFFFFF' : 'rgba(168, 92, 50, 0.04)',
                  color: cell.isThisMonth ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                  {cell.date.getUTCDate()}
                </div>
                <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {trips.slice(0, 3).map((t) => (
                    <Link
                      key={t.id}
                      href={`/app/trips/${t.id}`}
                      title={t.title}
                      style={{
                        display: 'block',
                        padding: '0.15rem 0.4rem',
                        borderRadius: 4,
                        background: t.color.bg,
                        color: t.color.fg,
                        fontSize: '0.72rem',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: t.status === 'completed' ? 0.7 : 1,
                      }}
                    >
                      {t.title}
                    </Link>
                  ))}
                  {trips.length > 3 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-muted)' }}>
                      +{trips.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer note on the 8-color palette source. */}
      {isOutfitterMember && (
        <p className="bb-form-help" style={{ marginTop: '0.75rem' }}>
          Colors are stable per guide. The palette ({ORG_GUIDE_PALETTE.length} hues) is colorblind-safe.
        </p>
      )}
    </main>
  )
}

function FilterChip({
  href,
  active,
  bg,
  fg,
  children,
}: {
  href: string
  active: boolean
  bg: string
  fg: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.7rem',
        borderRadius: 999,
        background: active ? bg : '#FFFFFF',
        color: active ? fg : 'var(--color-ink)',
        border: `1px solid ${active ? bg : 'var(--color-card-divider)'}`,
        fontSize: '0.82rem',
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: bg,
          display: 'inline-block',
        }}
      />
      {children}
    </Link>
  )
}

function LegendDot({ bg, label }: { bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span
        aria-hidden="true"
        style={{ width: 10, height: 10, borderRadius: 999, background: bg, display: 'inline-block' }}
      />
      {label}
    </span>
  )
}
