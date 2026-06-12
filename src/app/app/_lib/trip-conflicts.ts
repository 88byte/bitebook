// v28.1.0f.1 Sprint 3.4b — conflict detection for guide assignments.
//
// Used by createTripAction and updateTripAction to warn (not block)
// when a guide is being assigned to a trip whose time window overlaps
// another planned/active trip they are already on. The "warn, not
// block" policy was Flavio's decision (see scope doc).
//
// Pure functions live in this file so tests under test/ can exercise
// the overlap math without spinning up Supabase. A thin DB wrapper
// findGuideTripConflicts is exported below for the server actions.

import { createAdminClient } from '@/lib/supabase/admin'

/** A normalized half-open time interval. End is exclusive. */
export type Interval = { startMs: number; endMs: number }

/** Single conflict the UI can surface. */
export type Conflict = {
  guide_id: string
  trip_id: string
  title: string
  starts_at: string
  ends_at: string | null
}

/** Treat NULL ends_at as starts_at + 1 day so open-ended trips occupy a slot. */
export const OPEN_ENDED_MS = 24 * 60 * 60 * 1000

export function toInterval(starts_at: string, ends_at: string | null): Interval {
  const startMs = new Date(starts_at).getTime()
  const endMs =
    ends_at != null
      ? new Date(ends_at).getTime()
      : startMs + OPEN_ENDED_MS
  // Defensive: if ends_at < starts_at (data anomaly), treat as open-ended.
  if (endMs <= startMs) {
    return { startMs, endMs: startMs + OPEN_ENDED_MS }
  }
  return { startMs, endMs }
}

/** Half-open overlap: [a.start, a.end) intersects [b.start, b.end). */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

/** Database-backed conflict check. */
export async function findGuideTripConflicts(opts: {
  guide_ids: string[]
  starts_at: string
  ends_at: string | null
  /** When updating an existing trip, exclude its own row from the check. */
  exclude_trip_id?: string | null
}): Promise<Conflict[]> {
  if (!opts.guide_ids.length) return []
  const candidate = toInterval(opts.starts_at, opts.ends_at)
  const admin = createAdminClient()

  // Pull every trip_guides row for the relevant guides where the
  // parent trip is planned or active, then filter in-process. This
  // is cheap because we already index (guide_profile_id, trip_id)
  // and the working set is small.
  const { data: rows } = await admin
    .from('trip_guides')
    .select('guide_profile_id, trip_id, trips:trips!inner(id, title, starts_at, ends_at, status)')
    .in('guide_profile_id', opts.guide_ids)
    .in('trips.status', ['planned', 'active'])

  const conflicts: Conflict[] = []
  for (const r of rows ?? []) {
    const t = (r as unknown as {
      guide_profile_id: string
      trip_id: string
      trips: { id: string; title: string; starts_at: string; ends_at: string | null; status: string }
    }).trips
    if (!t) continue
    if (opts.exclude_trip_id && t.id === opts.exclude_trip_id) continue
    const other = toInterval(t.starts_at, t.ends_at)
    if (intervalsOverlap(candidate, other)) {
      conflicts.push({
        guide_id: (r as { guide_profile_id: string }).guide_profile_id,
        trip_id: t.id,
        title: t.title,
        starts_at: t.starts_at,
        ends_at: t.ends_at,
      })
    }
  }
  return conflicts
}
