import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

// ─────────────────────────────────────────────────────────────────────────────
// RLS WORKAROUND — read on this carefully.
//
// The Supabase RLS policies on profiles / trips / trip_participants / harvests
// are recursive (Postgres error 42P17). Until the DB-level fix lands (see
// supabase/migrations/<date>_fix_rls_recursion.sql), every user-session read
// of those tables errors out and breaks /app.
//
// This module wraps the admin (service-role) client so /app screens can keep
// rendering. Service role bypasses RLS, so SECURITY of these queries lives in
// THIS FILE — every helper requires a `guideId` that the caller has proven via
// requireGuide() (which calls Supabase auth.getUser() to verify the JWT). Each
// query enforces .eq('guide_id', guideId) (or an equivalent ownership check)
// in code so a guide can only see their own data.
//
// Rules:
// - Every export takes guideId: string as the FIRST argument.
// - Every query that returns a trip-scoped row filters by guide_id, OR
//   filters by trip_id and verifies that trip's guide_id matches first.
// - Never accept a guide_id from request input — only from requireGuide()'s
//   verified profile.id.
//
// Once the SQL fix is applied, swap createAdminClient() → createClient() and
// the explicit .eq('guide_id') filters become redundant (RLS handles them).
// ─────────────────────────────────────────────────────────────────────────────

type Trip = Database['public']['Tables']['trips']['Row']
type TripStatus = Database['public']['Enums']['trip_status']

export type TripRowWithCounts = Pick<
  Trip,
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind'
> & { hunters: number; harvests: number }

const RECENT_LIMIT = 10

// Aggregate-count embeds (`trip_participants(count)`) require a JOIN that
// touches the recursive policies even with admin (PostgREST builds the JOIN
// before RLS kicks in, but admin is fine — leaving here for the comment).
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
  const admin = createAdminClient()
  const { data, error } = await admin
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

export async function fetchTripsPage(
  guideId: string,
  opts: { status: TripStatus | 'all'; from: number; to: number }
): Promise<{ rows: TripRowWithCounts[]; total: number }> {
  const admin = createAdminClient()
  let query = admin
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
  const admin = createAdminClient()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [{ count: tripsThisYear }, hunterRows, harvestRows] = await Promise.all([
    admin
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('guide_id', guideId)
      .gte('starts_at', yearStart),
    admin
      .from('trip_participants')
      .select('hunter_id, guest_name, trips!inner(guide_id, starts_at)')
      .eq('trips.guide_id', guideId)
      .gte('trips.starts_at', yearStart),
    admin
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
  const admin = createAdminClient()
  // Verify ownership BEFORE we read any related rows. With admin client we
  // must enforce the guide_id check explicitly — RLS isn't doing it for us.
  const { data: trip, error: tripErr } = await admin
    .from('trips')
    .select('id, title, kind, status, starts_at, ends_at, location_name, notes')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (tripErr || !trip) return null

  const [participantsRes, harvestsRes] = await Promise.all([
    admin
      .from('trip_participants')
      .select('id, role, guest_name, hunter_id')
      .eq('trip_id', tripId),
    admin
      .from('harvests')
      .select('id, kind, species_name, harvested_at, tag_number, notes, hunter_id, quantity')
      .eq('trip_id', tripId)
      .order('harvested_at', { ascending: false }),
  ])

  // Resolve participant + harvest hunter names. Doing this in code instead of
  // an embed because the recursive RLS makes embed-joins fragile, and admin
  // doesn't share JOIN cost meaningfully here (rows are small per trip).
  const hunterIds = new Set<string>()
  ;(participantsRes.data ?? []).forEach((p) => p.hunter_id && hunterIds.add(p.hunter_id))
  ;(harvestsRes.data ?? []).forEach((h) => h.hunter_id && hunterIds.add(h.hunter_id))

  const profilesMap = new Map<string, { id: string; display_name: string }>()
  if (hunterIds.size > 0) {
    const { data: profiles } = await admin
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
  const admin = createAdminClient()
  // invitations is RLS-clean, so we could use the user client — but we use
  // admin everywhere in this file for consistency. guide_id filter pinned.
  const { data: accepted } = await admin
    .from('invitations')
    .select('accepted_by')
    .eq('guide_id', guideId)
    .eq('status', 'accepted')

  const ids = Array.from(
    new Set((accepted ?? []).map((r) => r.accepted_by).filter((v): v is string => !!v))
  )
  if (ids.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)

  return (profiles ?? []).sort((a, b) => a.display_name.localeCompare(b.display_name))
}

// Mutations — same admin-with-explicit-guide_id pattern.

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
  const admin = createAdminClient()
  const { data, error } = await admin
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
  const admin = createAdminClient()

  // Reverify the trip belongs to this guide before inserting children.
  const { data: trip } = await admin
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  const rows = hunterIds.map((hunter_id) => ({ trip_id: tripId, hunter_id }))
  const { error } = await admin.from('trip_participants').insert(rows)
  if (error) {
    console.warn('[queries.insertTripParticipants]', { guideId, tripId, code: error.code, message: error.message })
    return { error: error.message }
  }
  return { ok: true }
}

export async function closeTrip(guideId: string, tripId: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()
  const { error } = await admin
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
