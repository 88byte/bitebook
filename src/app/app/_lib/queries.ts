import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// ─────────────────────────────────────────────────────────────────────────────
// /app data layer.
//
// As of v22, the recursive RLS bug (Postgres 42P17) is fixed at the DB level
// by supabase/migrations/20260427_fix_rls_recursion.sql — SECURITY DEFINER
// helpers replaced the cross-table EXISTS clauses, so user-session reads on
// profiles / trips / trip_participants / harvests work natively.
//
// All queries here use the user-session client (createClient). RLS is now the
// primary authorization boundary.
//
// Defense-in-depth: every helper still takes a verified `guideId` (from
// requireGuide() → auth.getUser()) and applies `.eq('guide_id', guideId)`
// where applicable. RLS already enforces this; the in-code filter is a second
// layer in case a policy is ever broken or weakened. Keep the pattern unless
// you understand both layers and have a reason to remove it.
//
// Rules:
// - Every export takes guideId: string as the FIRST argument.
// - Never accept a guide_id from request input — only from requireGuide()'s
//   verified profile.id.
// ─────────────────────────────────────────────────────────────────────────────

type Trip = Database['public']['Tables']['trips']['Row']
type TripStatus = Database['public']['Enums']['trip_status']

export type TripRowWithCounts = Pick<
  Trip,
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind' | 'city' | 'state' | 'zone' | 'county'
> & { hunters: number; harvests: number }

const RECENT_LIMIT = 10

// v25.9.1: shared column list for the row-with-counts shape. Folded into a
// constant so every fetcher stays in sync after the location split.
// v26.3: row shape itself unchanged for the trip lists, but detail queries
// pull species_targeted + method via the dedicated TRIP_DETAIL_COLS.
const TRIP_ROW_COLS = `id, title, status, starts_at, ends_at, location_name, kind, city, state, zone, county`

function shapeTripWithCounts(t: Record<string, unknown>): TripRowWithCounts {
  const tp = t.trip_participants as { count: number }[] | null | undefined
  const hv = t.harvests as { count: number }[] | null | undefined
  return {
    id: t.id as string,
    title: t.title as string,
    status: t.status as TripStatus,
    starts_at: t.starts_at as string,
    ends_at: (t.ends_at as string | null) ?? null,
    location_name: (t.location_name as string | null) ?? null,
    kind: t.kind as 'hunting' | 'fishing',
    city: (t.city as string | null) ?? null,
    state: (t.state as string | null) ?? '',
    zone: (t.zone as string | null) ?? null,
    county: (t.county as string | null) ?? null,
    hunters: tp?.[0]?.count ?? 0,
    harvests: hv?.[0]?.count ?? 0,
  }
}

export async function fetchRecentTrips(guideId: string): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .select(`${TRIP_ROW_COLS},
             trip_participants(count), harvests(count)`)
    .eq('guide_id', guideId)
    .order('starts_at', { ascending: false })
    .limit(RECENT_LIMIT)
  if (error) {
    console.warn('[queries.fetchRecentTrips]', { guideId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map(shapeTripWithCounts)
}

// v24: dashboard widget query — trips with starts_at >= today, ascending.
export async function fetchUpcomingTrips(
  guideId: string,
  limit = 5
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('trips')
    .select(`${TRIP_ROW_COLS},
             trip_participants(count), harvests(count)`)
    .eq('guide_id', guideId)
    .gte('starts_at', todayStart.toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[queries.fetchUpcomingTrips]', { guideId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map(shapeTripWithCounts)
}

// v24: count of pending invitations for the dashboard widget.
export async function fetchPendingInviteCount(guideId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('guide_id', guideId)
    .eq('status', 'pending')
  if (error) {
    console.warn('[queries.fetchPendingInviteCount]', { guideId, code: error.code, message: error.message })
    return 0
  }
  return count ?? 0
}

export async function fetchTripsPage(
  guideId: string,
  opts: { status: TripStatus | 'all'; from: number; to: number }
): Promise<{ rows: TripRowWithCounts[]; total: number }> {
  const supabase = await createClient()
  let query = supabase
    .from('trips')
    .select(
      `${TRIP_ROW_COLS},
       trip_participants(count), harvests(count)`,
      { count: 'exact' }
    )
    .eq('guide_id', guideId)
    .order('starts_at', { ascending: false })
    .range(opts.from, opts.to)
  if (opts.status !== 'all') query = query.eq('status', opts.status)
  const { data, count, error } = await query
  if (error) {
    console.warn('[queries.fetchTripsPage]', { guideId, code: error.code, message: error.message })
    return { rows: [], total: 0 }
  }
  return { rows: (data ?? []).map(shapeTripWithCounts), total: count ?? 0 }
}

export type DashboardStats = {
  tripsThisYear: number
  huntersServed: number
  harvests: number
}

export async function fetchDashboardStats(guideId: string): Promise<DashboardStats> {
  const supabase = await createClient()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [{ count: tripsThisYear }, hunterRows, harvestRows] = await Promise.all([
    supabase
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('guide_id', guideId)
      .gte('starts_at', yearStart),
    supabase
      .from('trip_participants')
      .select('hunter_id, guest_name, trips!inner(guide_id, starts_at)')
      .eq('trips.guide_id', guideId)
      .gte('trips.starts_at', yearStart),
    supabase
      .from('harvests')
      .select('quantity, trips!inner(guide_id, starts_at)')
      .eq('trips.guide_id', guideId)
      .gte('trips.starts_at', yearStart),
  ])

  const huntersServed = new Set(
    (hunterRows.data ?? []).map((r) => r.hunter_id ?? `guest:${r.guest_name ?? ''}`)
  ).size
  const harvests = (harvestRows.data ?? []).reduce((acc, r) => acc + (r.quantity ?? 0), 0)
  return { tripsThisYear: tripsThisYear ?? 0, huntersServed, harvests }
}

export type TripDetail = {
  trip: Pick<Trip, 'id' | 'title' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'city' | 'state' | 'zone' | 'county' | 'notes' | 'species_targeted' | 'method'>
  participants: Array<{
    id: string
    role: string
    guest_name: string | null
    hunter_id: string | null
    profile: { id: string; display_name: string } | null
  }>
  harvests: Array<{
    id: string
    kind: string
    species_name: string | null
    harvested_at: string
    tag_number: string | null
    notes: string | null
    hunter_id: string | null
    quantity: number
    method: string | null
    hunter_name: string | null
  }>
}

export async function fetchTripDetail(guideId: string, tripId: string): Promise<TripDetail | null> {
  const supabase = await createClient()
  // RLS gates this on guide_id = auth.uid(); the explicit .eq('guide_id') is
  // defense-in-depth (see file header).
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, title, kind, status, starts_at, ends_at, location_name, city, state, zone, county, notes, species_targeted, method')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (tripErr || !trip) return null

  const [participantsRes, harvestsRes] = await Promise.all([
    supabase
      .from('trip_participants')
      .select('id, role, guest_name, hunter_id')
      .eq('trip_id', tripId),
    supabase
      .from('harvests')
      .select('id, kind, species_name, harvested_at, tag_number, notes, hunter_id, quantity, method')
      .eq('trip_id', tripId)
      .order('harvested_at', { ascending: false }),
  ])

  // Resolve participant + harvest hunter names in code rather than via embed.
  // RLS on profiles allows the trip's guide to read participant profiles via
  // the profiles_guide_sees_participants policy.
  const hunterIds = new Set<string>()
  ;(participantsRes.data ?? []).forEach((p) => p.hunter_id && hunterIds.add(p.hunter_id))
  ;(harvestsRes.data ?? []).forEach((h) => h.hunter_id && hunterIds.add(h.hunter_id))

  const profilesMap = new Map<string, { id: string; display_name: string }>()
  if (hunterIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', Array.from(hunterIds))
    ;(profiles ?? []).forEach((p) => profilesMap.set(p.id, p))
  }

  return {
    trip,
    participants: (participantsRes.data ?? []).map((p) => ({
      id: p.id,
      role: p.role,
      guest_name: p.guest_name,
      hunter_id: p.hunter_id,
      profile: p.hunter_id ? profilesMap.get(p.hunter_id) ?? null : null,
    })),
    harvests: (harvestsRes.data ?? []).map((h) => ({
      id: h.id,
      kind: h.kind,
      species_name: h.species_name,
      harvested_at: h.harvested_at,
      tag_number: h.tag_number,
      notes: h.notes,
      hunter_id: h.hunter_id,
      quantity: h.quantity,
      method: h.method ?? null,
      hunter_name: h.hunter_id ? profilesMap.get(h.hunter_id)?.display_name ?? null : null,
    })),
  }
}

export type HunterCandidate = { id: string; display_name: string }

export async function fetchAcceptedHunters(guideId: string): Promise<HunterCandidate[]> {
  const supabase = await createClient()
  const { data: accepted } = await supabase
    .from('invitations')
    .select('accepted_by')
    .eq('guide_id', guideId)
    .eq('status', 'accepted')

  const ids = Array.from(
    new Set((accepted ?? []).map((r) => r.accepted_by).filter((v): v is string => !!v))
  )
  if (ids.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)

  return (profiles ?? []).sort((a, b) => a.display_name.localeCompare(b.display_name))
}

// Mutations — RLS gates ownership; explicit .eq('guide_id') is defense-in-depth.

export async function insertTrip(
  guideId: string,
  input: {
    title: string
    kind: 'hunting' | 'fishing'
    starts_at: string
    ends_at: string | null
    location_name: string | null
    city: string | null
    state: string
    zone: string | null
    county: string | null
    species_targeted: string | null
    method: string | null
    notes: string | null
  }
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .insert({ ...input, guide_id: guideId })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[queries.insertTrip]', { guideId, code: error?.code, message: error?.message })
    return { error: error?.message ?? 'Could not create trip.' }
  }
  return { id: data.id }
}

// v26.3: full trip update used by EditTripForm. RLS gates ownership; the
// explicit .eq('guide_id') is defense-in-depth.
export async function updateTrip(
  guideId: string,
  tripId: string,
  input: {
    title: string
    kind: 'hunting' | 'fishing'
    starts_at: string
    ends_at: string | null
    city: string | null
    state: string
    zone: string | null
    county: string | null
    species_targeted: string | null
    method: string | null
    notes: string | null
  }
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('trips')
    .update(input)
    .eq('id', tripId)
    .eq('guide_id', guideId)
  if (error) {
    console.warn('[queries.updateTrip]', { guideId, tripId, code: error.code, message: error.message })
    return { error: error.message }
  }
  return { ok: true }
}

// v26.3: replace the participant set for a trip. We compute add/remove deltas
// in code rather than truncating-then-inserting so we don't unnecessarily
// invalidate added_at timestamps on already-present participants. Returns ok
// even when the delta is empty.
export async function syncTripParticipants(
  guideId: string,
  tripId: string,
  desiredHunterIds: string[]
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { data: trip } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  const { data: existing, error: readErr } = await supabase
    .from('trip_participants')
    .select('id, hunter_id')
    .eq('trip_id', tripId)
  if (readErr) {
    console.warn('[queries.syncTripParticipants] read', { tripId, code: readErr.code, message: readErr.message })
    return { error: readErr.message }
  }

  const existingHunterIds = new Set(
    (existing ?? []).map((r) => r.hunter_id).filter((v): v is string => !!v)
  )
  const desired = new Set(desiredHunterIds)

  const toAdd = Array.from(desired).filter((id) => !existingHunterIds.has(id))
  const toRemove = (existing ?? [])
    .filter((r) => r.hunter_id && !desired.has(r.hunter_id))
    .map((r) => r.id)

  if (toAdd.length > 0) {
    const rows = toAdd.map((hunter_id) => ({ trip_id: tripId, hunter_id }))
    const { error } = await supabase.from('trip_participants').insert(rows)
    if (error) {
      console.warn('[queries.syncTripParticipants] insert', { tripId, code: error.code, message: error.message })
      return { error: error.message }
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('trip_participants')
      .delete()
      .in('id', toRemove)
    if (error) {
      console.warn('[queries.syncTripParticipants] delete', { tripId, code: error.code, message: error.message })
      return { error: error.message }
    }
  }

  return { ok: true }
}

// v26.3: status transitions. closeTrip kept as the wrap-up path; reopenTrip
// flips a completed/canceled trip back to active.
export async function reopenTrip(guideId: string, tripId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('trips')
    .update({ status: 'active' })
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .in('status', ['completed', 'canceled'])
  if (error) {
    console.warn('[queries.reopenTrip]', { guideId, tripId, code: error.code, message: error.message })
    return { error: error.message }
  }
  return { ok: true }
}

// v26.3: insert a harvest for a trip the caller owns. Reverifies trip
// ownership + status before inserting so a stale form submission against a
// closed trip yields a friendly error rather than an RLS denial.
export async function insertHarvest(
  guideId: string,
  input: {
    trip_id: string
    hunter_id: string | null
    kind: 'hunting' | 'fishing'
    species_name: string | null
    method: string | null
    quantity: number
    tag_number: string | null
    harvested_at: string
    notes: string | null
  }
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: trip } = await supabase
    .from('trips')
    .select('id, status')
    .eq('id', input.trip_id)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }
  if (trip.status !== 'planned' && trip.status !== 'active') {
    return { error: 'This trip is closed; reopen it before logging more harvests.' }
  }

  const { data, error } = await supabase
    .from('harvests')
    .insert(input)
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[queries.insertHarvest]', { guideId, code: error?.code, message: error?.message })
    return { error: error?.message ?? 'Could not save the harvest.' }
  }
  return { id: data.id }
}

export async function insertTripParticipants(
  guideId: string,
  tripId: string,
  hunterIds: string[]
): Promise<{ ok: true } | { error: string }> {
  if (hunterIds.length === 0) return { ok: true }
  const supabase = await createClient()

  // Reverify the trip belongs to this guide before inserting children.
  const { data: trip } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  const rows = hunterIds.map((hunter_id) => ({ trip_id: tripId, hunter_id }))
  const { error } = await supabase.from('trip_participants').insert(rows)
  if (error) {
    console.warn('[queries.insertTripParticipants]', { guideId, tripId, code: error.code, message: error.message })
    return { error: error.message }
  }
  return { ok: true }
}

export async function closeTrip(guideId: string, tripId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('trips')
    .update({ status: 'completed' })
    .eq('id', tripId)
    .eq('guide_id', guideId)
  if (error) {
    console.warn('[queries.closeTrip]', { guideId, tripId, code: error.code, message: error.message })
    return { error: error.message }
  }
  return { ok: true }
}

// ─── v25.1: hunter-side reads ────────────────────────────────────────────────
//
// Hunters access trips via trip_participants where hunter_id = auth.uid().
// The RLS policy `trips_participant_select` (SECURITY DEFINER helper
// `_is_trip_participant`) lets a hunter read a trip row when they're on it,
// and `harvests_hunter_select` lets them read their own harvests. So we use
// the user-session client — no service-role escape hatch.
//
// Defense-in-depth analog to .eq('guide_id'): every helper here takes a
// verified `hunterId` (from requireHunter().profile.id) and applies it
// where the schema supports it (.eq('hunter_id', hunterId) on
// trip_participants and harvests).

function shapeHunterTripRow(t: Record<string, unknown>): TripRowWithCounts {
  // Same fields as shapeTripWithCounts, but pulled from the embedded
  // trips({...}) under a trip_participants row rather than the top level.
  return shapeTripWithCounts(t)
}

export async function fetchHunterTrips(
  hunterId: string,
  limit = 5
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  // We pull trip_participants -> trips. Embedded select gives us each trip
  // exactly once (a hunter only has one participant row per trip).
  const { data, error } = await supabase
    .from('trip_participants')
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count), harvests(count)
      )`
    )
    .eq('hunter_id', hunterId)
    .order('starts_at', { foreignTable: 'trip', ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[queries.fetchHunterTrips]', { hunterId, code: error.code, message: error.message })
    return []
  }
  return (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => !!t)
    .map(shapeHunterTripRow)
}

export async function fetchHunterTripsPage(
  hunterId: string,
  opts: { status: TripStatus | 'all'; from: number; to: number }
): Promise<{ rows: TripRowWithCounts[]; total: number }> {
  const supabase = await createClient()
  // Fetch the participant rows + embedded trip, then filter/paginate in code.
  // We can't apply offset/limit on the embedded relation directly across the
  // join, so we pull all the user's participant rows (typically small) and
  // page in memory.
  let query = supabase
    .from('trip_participants')
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count), harvests(count)
      )`
    )
    .eq('hunter_id', hunterId)
  if (opts.status !== 'all') query = query.eq('trip.status', opts.status)
  const { data, error } = await query
  if (error) {
    console.warn('[queries.fetchHunterTripsPage]', { hunterId, code: error.code, message: error.message })
    return { rows: [], total: 0 }
  }
  const all = (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => !!t)
    .map(shapeHunterTripRow)
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
  const total = all.length
  const rows = all.slice(opts.from, opts.to + 1)
  return { rows, total }
}

export type HunterTripDetail = {
  trip: Pick<Trip, 'id' | 'title' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'city' | 'state' | 'zone' | 'county' | 'notes'>
  guide: { id: string; display_name: string; business_name: string | null } | null
  participants: Array<{
    id: string
    role: string
    guest_name: string | null
    hunter_id: string | null
    profile: { id: string; display_name: string } | null
  }>
  myHarvests: Array<{
    id: string
    kind: string
    species_name: string | null
    harvested_at: string
    tag_number: string | null
    notes: string | null
    quantity: number
  }>
}

export async function fetchHunterTripDetail(
  hunterId: string,
  tripId: string
): Promise<HunterTripDetail | null> {
  const supabase = await createClient()

  // Defense-in-depth: confirm participant row exists for this (trip, hunter).
  // RLS already gates, but a missing row should produce a null return rather
  // than an empty trip render.
  const { data: participantRow } = await supabase
    .from('trip_participants')
    .select('id')
    .eq('trip_id', tripId)
    .eq('hunter_id', hunterId)
    .maybeSingle()
  if (!participantRow) return null

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, title, kind, status, starts_at, ends_at, location_name, city, state, zone, county, notes, guide_id')
    .eq('id', tripId)
    .maybeSingle()
  if (tripErr || !trip) return null

  const [participantsRes, harvestsRes, guideProfileRes, guideBusinessRes] = await Promise.all([
    supabase
      .from('trip_participants')
      .select('id, role, guest_name, hunter_id')
      .eq('trip_id', tripId),
    supabase
      .from('harvests')
      .select('id, kind, species_name, harvested_at, tag_number, notes, quantity, hunter_id')
      .eq('trip_id', tripId)
      .eq('hunter_id', hunterId)
      .order('harvested_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', trip.guide_id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select('business_name')
      .eq('user_id', trip.guide_id)
      .maybeSingle(),
  ])

  // Resolve OTHER participants' display names. RLS allows hunters who share a
  // trip to see each other's profiles via the participant policy; we still
  // tolerate failures by falling back to guest_name / "Hunter".
  const otherIds = Array.from(
    new Set(
      (participantsRes.data ?? [])
        .map((p) => p.hunter_id)
        .filter((v): v is string => !!v && v !== hunterId)
    )
  )
  const profilesMap = new Map<string, { id: string; display_name: string }>()
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', otherIds)
    ;(profiles ?? []).forEach((p) => profilesMap.set(p.id, p))
  }

  return {
    trip: {
      id: trip.id,
      title: trip.title,
      kind: trip.kind,
      status: trip.status,
      starts_at: trip.starts_at,
      ends_at: trip.ends_at,
      location_name: trip.location_name,
      city: trip.city,
      state: trip.state,
      zone: trip.zone,
      county: trip.county,
      notes: trip.notes,
    },
    guide: guideProfileRes.data
      ? {
          id: guideProfileRes.data.id,
          display_name: guideProfileRes.data.display_name,
          business_name: guideBusinessRes.data?.business_name ?? null,
        }
      : null,
    participants: (participantsRes.data ?? []).map((p) => ({
      id: p.id,
      role: p.role,
      guest_name: p.guest_name,
      hunter_id: p.hunter_id,
      profile: p.hunter_id ? profilesMap.get(p.hunter_id) ?? null : null,
    })),
    myHarvests: (harvestsRes.data ?? []).map((h) => ({
      id: h.id,
      kind: h.kind,
      species_name: h.species_name,
      harvested_at: h.harvested_at,
      tag_number: h.tag_number,
      notes: h.notes,
      quantity: h.quantity,
    })),
  }
}

// v26.2: hunter-side reads of accepted invitations to surface the guides a
// hunter is connected to. Existing-hunter auto-accept (v25.7) creates an
// invitations row before any trip exists, so a hunter could be in a guide's
// network with no visible signal until the guide adds them to a trip. The
// dashboard widget on /app/h closes that gap.
//
// RLS: invitations.* permits hunter SELECT where accepted_by = auth.uid()
// (existing policy). The new profiles_hunter_sees_connected_guides policy
// (migration add_profiles_hunter_sees_connected_guides) lets the hunter read
// the linked guide's profile row. guide_profiles.* already permits any
// authenticated user to SELECT (existing policy `authenticated reads guide
// profiles`).
export type HunterGuideConnection = {
  invite_id: string
  guide_id: string
  accepted_at: string
  display_name: string
  business_name: string | null
}

export async function fetchHunterGuides(hunterId: string): Promise<HunterGuideConnection[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invitations')
    .select('id, guide_id, created_at, status, accepted_by')
    .eq('accepted_by', hunterId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
  if (error || !data) {
    if (error) {
      console.warn('[queries.fetchHunterGuides] invitations', { hunterId, code: error.code, message: error.message })
    }
    return []
  }

  const guideIds = Array.from(new Set(data.map((r) => r.guide_id))).filter((v): v is string => !!v)
  if (guideIds.length === 0) return []

  const [profilesRes, guideProfilesRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', guideIds),
    supabase.from('guide_profiles').select('user_id, business_name').in('user_id', guideIds),
  ])
  // Soft-tolerate RLS misses — empty maps mean we fall back to the "Guide"
  // sentinel name for that row, but the row itself still renders.
  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p.display_name as string])
  )
  const guideProfileMap = new Map(
    (guideProfilesRes.data ?? []).map((g) => [g.user_id as string, g.business_name as string | null])
  )

  return data.map((row) => ({
    invite_id: row.id,
    guide_id: row.guide_id,
    accepted_at: row.created_at,
    display_name: profileMap.get(row.guide_id) ?? 'Guide',
    business_name: guideProfileMap.get(row.guide_id) ?? null,
  }))
}

export type HunterStats = {
  trips: number
  harvests: number
  guides: number
}

export async function fetchHunterStats(hunterId: string): Promise<HunterStats> {
  const supabase = await createClient()
  const [participantsRes, harvestsRes] = await Promise.all([
    supabase
      .from('trip_participants')
      .select('trip_id, trips!inner(guide_id)')
      .eq('hunter_id', hunterId),
    supabase
      .from('harvests')
      .select('id', { count: 'exact', head: true })
      .eq('hunter_id', hunterId),
  ])

  const tripsSet = new Set<string>()
  const guidesSet = new Set<string>()
  ;(participantsRes.data ?? []).forEach((row) => {
    const r = row as { trip_id: string; trips: { guide_id: string } | { guide_id: string }[] | null }
    tripsSet.add(r.trip_id)
    const trips = r.trips
    if (Array.isArray(trips)) {
      trips.forEach((t) => t?.guide_id && guidesSet.add(t.guide_id))
    } else if (trips && trips.guide_id) {
      guidesSet.add(trips.guide_id)
    }
  })

  return {
    trips: tripsSet.size,
    harvests: harvestsRes.count ?? 0,
    guides: guidesSet.size,
  }
}

// ─── v26.0 Batch A: reviews reads ────────────────────────────────────────────
//
// Reads run on the user-session client. RLS policies (added in
// 20260427_add_trip_reviews_table.sql) gate reads:
//   - hunter sees rows where hunter_id = auth.uid()
//   - guide sees rows where guide_id = auth.uid()
// Defense-in-depth: every fetcher takes a verified guideId/hunterId and
// applies it via .eq().

export type ReviewSort = 'recent' | 'oldest' | 'highest' | 'lowest'

export type GuideReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  trip: {
    id: string
    title: string
    starts_at: string
    ends_at: string | null
  } | null
  hunter: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
}

export async function fetchGuideReviews(
  guideId: string,
  sort: ReviewSort
): Promise<GuideReviewRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('trip_reviews')
    .select(
      `id, rating, comment, created_at,
       trip:trips!inner(id, title, starts_at, ends_at),
       hunter:profiles!trip_reviews_hunter_id_fkey(id, display_name, avatar_url)`
    )
    .eq('guide_id', guideId)

  switch (sort) {
    case 'recent':
      query = query.order('created_at', { ascending: false })
      break
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'highest':
      query = query.order('rating', { ascending: false }).order('created_at', { ascending: false })
      break
    case 'lowest':
      query = query.order('rating', { ascending: true }).order('created_at', { ascending: false })
      break
  }

  const { data, error } = await query
  if (error) {
    console.warn('[queries.fetchGuideReviews]', { guideId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const trip = (row.trip ?? null) as GuideReviewRow['trip'] | null
    const hunter = (row.hunter ?? null) as GuideReviewRow['hunter'] | null
    return {
      id: row.id as string,
      rating: row.rating as number,
      comment: (row.comment as string | null) ?? null,
      created_at: row.created_at as string,
      trip,
      hunter,
    }
  })
}

export type GuideReviewStats = {
  count: number
  average: number
  // distribution[i] = count of reviews with rating === i+1 (i ∈ 0..4)
  distribution: [number, number, number, number, number]
}

export async function fetchGuideReviewStats(guideId: string): Promise<GuideReviewStats> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trip_reviews')
    .select('rating')
    .eq('guide_id', guideId)
  if (error) {
    console.warn('[queries.fetchGuideReviewStats]', { guideId, code: error.code, message: error.message })
    return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] }
  }
  const rows = data ?? []
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  let sum = 0
  for (const r of rows) {
    const v = r.rating
    if (v >= 1 && v <= 5) {
      dist[v - 1] += 1
      sum += v
    }
  }
  const count = rows.length
  const average = count > 0 ? sum / count : 0
  return { count, average, distribution: dist }
}

export type HunterTripReview = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

export async function fetchHunterTripReview(
  hunterId: string,
  tripId: string
): Promise<HunterTripReview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trip_reviews')
    .select('id, rating, comment, created_at, updated_at')
    .eq('trip_id', tripId)
    .eq('hunter_id', hunterId)
    .maybeSingle()
  if (error) {
    console.warn('[queries.fetchHunterTripReview]', { hunterId, tripId, code: error.code, message: error.message })
    return null
  }
  return data ?? null
}
