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
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind'
> & { hunters: number; harvests: number }

const RECENT_LIMIT = 10

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
    hunters: tp?.[0]?.count ?? 0,
    harvests: hv?.[0]?.count ?? 0,
  }
}

export async function fetchRecentTrips(guideId: string): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .select(`id, title, status, starts_at, ends_at, location_name, kind,
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
    .select(`id, title, status, starts_at, ends_at, location_name, kind,
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
      `id, title, status, starts_at, ends_at, location_name, kind,
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
  trip: Pick<Trip, 'id' | 'title' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'notes'>
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
    hunter_name: string | null
  }>
}

export async function fetchTripDetail(guideId: string, tripId: string): Promise<TripDetail | null> {
  const supabase = await createClient()
  // RLS gates this on guide_id = auth.uid(); the explicit .eq('guide_id') is
  // defense-in-depth (see file header).
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, title, kind, status, starts_at, ends_at, location_name, notes')
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
      .select('id, kind, species_name, harvested_at, tag_number, notes, hunter_id, quantity')
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
