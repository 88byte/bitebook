import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'

type TripStatus = Database['public']['Enums']['trip_status']
type TripKind = Database['public']['Tables']['trips']['Row']['kind']

type CalendarTrip = {
  id: string
  title: string
  status: TripStatus
  kind: TripKind
  starts_at: string
  ends_at: string | null
}

// v27.6.1 — color rule: activity drives color; canceled overrides.
// Fishing → blue, hunting → green, canceled (any kind) → red.
// Drops the v27.5.0.5 status-only treatment where Done = tan and
// Active = copper.
function barColorClass(t: { status: TripStatus; kind: TripKind }): string {
  if (t.status === 'canceled') return 'bb-cal-bar-canceled'
  if (t.kind === 'fishing') return 'bb-cal-bar-fishing'
  return 'bb-cal-bar-hunting'
}

// v27.5.0.5 — month-grid calendar that replaces the "Recent trips" right
// rail on /app/trips. Server-rendered: month nav is URL-driven via ?ym=,
// status filter passed through to keep the chip filter consistent.
//
// Rendering model: 6 weekly rows max, each week computes its own bar
// layout independently. Multi-day trips render as a single bar that
// spans the cells they cover within that week, clipped at week boundaries
// (so a trip crossing a Sunday boundary shows two bars — one ending
// Saturday, one starting Sunday — rather than one impossible bar).
//
// Lane packing: for each week we sort overlapping trips by start, then
// by length desc, then assign the lowest free lane. Up to MAX_LANES
// visible per week; any overflow is summarized as "+N more".
const MAX_LANES = 3

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function daysBetween(a: Date, b: Date): number {
  // a, b assumed startOfDay locally — diff in whole days, b - a
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

function sameYearMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

// First grid cell = Sunday on/before the 1st of the month.
function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1)
  return addDays(startOfDay(first), -first.getDay())
}

function ymKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function chipHref(view: 'cards' | 'calendar', status: TripStatus | 'all', ym: string): string {
  const sp = new URLSearchParams()
  if (status !== 'all') sp.set('status', status)
  if (view === 'calendar') sp.set('view', 'calendar')
  sp.set('ym', ym)
  return `/app/trips${sp.toString() ? `?${sp}` : ''}`
}

export default function TripsCalendar({
  trips,
  year,
  month,
  status,
  view,
}: {
  trips: CalendarTrip[]
  year: number
  month: number // 0-indexed
  status: TripStatus | 'all'
  view: 'cards' | 'calendar'
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const start = gridStart(year, month)
  // 6 weeks × 7 days = 42 cells, always — keeps row count stable.
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  const today = startOfDay(new Date())
  const todayYm = ymKey(today)
  const currentYm = `${year}-${String(month + 1).padStart(2, '0')}`

  const prevDate = new Date(year, month - 1, 1)
  const nextDate = new Date(year, month + 1, 1)

  // Pre-compute trip start/end as local startOfDay for stable comparisons.
  const indexedTrips = trips.map((t) => {
    const s = startOfDay(new Date(t.starts_at))
    const e = t.ends_at ? startOfDay(new Date(t.ends_at)) : s
    return { ...t, _start: s, _end: e }
  })

  // Split cells into 6 weeks of 7.
  const weeks: Date[][] = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7))

  return (
    <div className="bb-cal">
      <div className="bb-cal-head">
        <div className="bb-cal-head-title">
          <span className="bb-cal-head-month">{monthLabel}</span>
        </div>
        <div className="bb-cal-head-nav">
          <Link
            href={chipHref(view, status, ymKey(prevDate))}
            className="bb-cal-nav-btn"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
          <Link
            href={chipHref(view, status, todayYm)}
            className="bb-cal-today-btn"
            aria-current={currentYm === todayYm ? 'true' : undefined}
          >
            Today
          </Link>
          <Link
            href={chipHref(view, status, ymKey(nextDate))}
            className="bb-cal-nav-btn"
            aria-label="Next month"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="bb-cal-weekdays" aria-hidden="true">
        {DAY_LABELS.map((d, i) => (
          <span key={i} className="bb-cal-weekday">{d}</span>
        ))}
      </div>

      <div className="bb-cal-weeks">
        {weeks.map((week, wIdx) => {
          const weekStart = week[0]
          const weekEnd = week[6]
          // Trips that touch this week.
          const touching = indexedTrips.filter(
            (t) => t._start <= weekEnd && t._end >= weekStart
          )
          // Within-week segments.
          const segments = touching
            .map((t) => {
              const segStart = t._start < weekStart ? weekStart : t._start
              const segEnd = t._end > weekEnd ? weekEnd : t._end
              return {
                trip: t,
                startCol: daysBetween(weekStart, segStart),
                span: daysBetween(segStart, segEnd) + 1,
                continuesLeft: t._start < weekStart,
                continuesRight: t._end > weekEnd,
              }
            })
            .sort((a, b) => {
              if (a.startCol !== b.startCol) return a.startCol - b.startCol
              if (b.span !== a.span) return b.span - a.span
              return a.trip._start.getTime() - b.trip._start.getTime()
            })
          // Lane pack: assign each segment the lowest free lane.
          const lanes: number[] = [] // lanes[i] = endCol (exclusive) of last segment in lane i
          const placed = segments.map((seg) => {
            const segEnd = seg.startCol + seg.span
            let lane = 0
            while (lane < lanes.length && lanes[lane] > seg.startCol) lane++
            if (lane >= lanes.length) lanes.push(segEnd)
            else lanes[lane] = segEnd
            return { ...seg, lane }
          })
          const visible = placed.filter((p) => p.lane < MAX_LANES)
          const overflowByCol: Record<number, number> = {}
          for (const p of placed) {
            if (p.lane >= MAX_LANES) {
              for (let c = p.startCol; c < p.startCol + p.span; c++) {
                overflowByCol[c] = (overflowByCol[c] ?? 0) + 1
              }
            }
          }

          return (
            <div key={wIdx} className="bb-cal-week">
              <div className="bb-cal-week-cells">
                {week.map((d, dIdx) => {
                  const inMonth = sameYearMonth(d, new Date(year, month, 1))
                  const isToday = d.getTime() === today.getTime()
                  const overflow = overflowByCol[dIdx] ?? 0
                  return (
                    <div
                      key={dIdx}
                      className={
                        'bb-cal-cell' +
                        (inMonth ? '' : ' is-out') +
                        (isToday ? ' is-today' : '')
                      }
                    >
                      <span className="bb-cal-cell-num">{d.getDate()}</span>
                      {overflow > 0 ? (
                        <span className="bb-cal-cell-more">+{overflow} more</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <div className="bb-cal-week-bars" aria-hidden={false}>
                {visible.map((p) => {
                  const leftPct = (p.startCol / 7) * 100
                  const widthPct = (p.span / 7) * 100
                  const topRem = 1.6 + p.lane * 1.35 // below the date number
                  return (
                    <Link
                      key={p.trip.id + '-' + wIdx}
                      href={`/app/trips/${p.trip.id}`}
                      className={
                        'bb-cal-bar ' +
                        barColorClass(p.trip) +
                        (p.continuesLeft ? ' is-cont-left' : '') +
                        (p.continuesRight ? ' is-cont-right' : '')
                      }
                      style={{
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        top: `${topRem}rem`,
                      }}
                      title={p.trip.title}
                    >
                      <span className="bb-cal-bar-text">{p.trip.title}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
