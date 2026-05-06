import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { normalizeWeaponRestriction } from '@/lib/methods'

// v27.0b.6: shared species lookup. Public-readable table (RLS:
// authenticated SELECT). Returns common names sorted by display_order
// then name. Use this on the wallet form + harvest forms to back the
// datalist autocomplete. Free-text input still allowed downstream;
// the list is suggestion-only.
// v27.0b.6 (B + C): trip ↔ wallet linkage helpers.
//
// LinkedWalletItem — what a guide sees in the participant chip row, and
// what the hunter sees in the action-needed card "use existing" dropdown.
// Pulled from trip_wallet_items JOIN wallet_items.
export type LinkedWalletItem = {
  id: string
  type: Database['public']['Enums']['wallet_item_type']
  identifier: string
  state: string | null
  species: string | null
  zone: string | null
}

// fetchTripWalletLinks — used by guide trip detail to render chips per
// hunter. Returns Map<hunter_id, LinkedWalletItem[]>. RLS lets the guide
// read the participants' wallet items via the v27.0a.23 trip-link policy.
export async function fetchTripWalletLinks(
  tripId: string
): Promise<Map<string, LinkedWalletItem[]>> {
  const supabase = await createClient()
  const out = new Map<string, LinkedWalletItem[]>()
  const { data: links, error } = await supabase
    .from('trip_wallet_items')
    .select(
      'hunter_id, wallet_item_id, wallet_items!inner(id, type, identifier, state, species, zone)'
    )
    .eq('trip_id', tripId)
    .order('linked_at', { ascending: true })
  if (error || !links) {
    if (error) console.warn('[queries.fetchTripWalletLinks]', { tripId, code: error.code, message: error.message })
    return out
  }
  for (const link of links) {
    const item = (link as unknown as { wallet_items: LinkedWalletItem | null }).wallet_items
    if (!item) continue
    const arr = out.get(link.hunter_id) ?? []
    arr.push(item)
    out.set(link.hunter_id, arr)
  }
  return out
}

// fetchHunterMatchingWalletItems — hunter-side dropdown for the action
// queue card. Pulls the hunter's own ACTIVE wallet items of a given type
// (license / tag).
//
// v27.0b.8.1: dropped the strict state filter. Filtering by state was
// hiding all the hunter's licenses/tags whenever the trip was in a
// different state from any of their items — even when the hunter had
// the right wallet items but in a different state from the trip.
// State is now a soft preference: items matching the trip's state sort
// first, then the rest. Hunter is still responsible for picking the
// correct one. The action card's "Add new" path remains for items they
// don't yet own.
//
// Filter rules:
//   - same type
//   - active (not archived, not tagged-out, not expired)
// Sort: matching state first, then by valid_to ascending.
export async function fetchHunterMatchingWalletItems(
  hunterId: string,
  type: Database['public']['Enums']['wallet_item_type'],
  state?: string | null
): Promise<LinkedWalletItem[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('wallet_items')
    .select('id, type, identifier, state, species, zone')
    .eq('user_id', hunterId)
    .eq('type', type)
    .is('archived_at', null)
    .is('tagged_out_at', null)
    .gte('valid_to', today)
    .order('valid_to', { ascending: true })
  if (error || !data) {
    if (error) console.warn('[queries.fetchHunterMatchingWalletItems]', { hunterId, type, code: error.code, message: error.message })
    return []
  }
  // Soft sort: items matching the trip state first.
  if (state) {
    const wanted = state.toUpperCase()
    return [...data].sort((a, b) => {
      const aMatch = (a.state ?? '').toUpperCase() === wanted ? 0 : 1
      const bMatch = (b.state ?? '').toUpperCase() === wanted ? 0 : 1
      return aMatch - bMatch
    })
  }
  return data
}

// v27.1.3.0.6 — hunter-side cross-trip pending wallet-link surfaces.
// One row per missing wallet link (license / tag) on each open
// (planned | active) trip the hunter is on. Used by:
//   - /app/h dashboard PendingActionsCard alongside trip-doc pending rows
//   - /app/h/trips trip-card "action needed" badge
// Tag rows only emit when the trip has species_targeted set (otherwise
// the trip detail's ActionNeededCard wouldn't render a tag row either).
export type HunterPendingWalletLink = {
  trip_id: string
  trip_title: string
  trip_starts_at: string
  trip_state: string | null
  kind: 'license' | 'tag'
  species: string | null
}

export async function fetchHunterPendingWalletLinks(
  hunterId: string
): Promise<HunterPendingWalletLink[]> {
  const supabase = await createClient()
  // Pull every open trip the hunter is on with the columns we need to
  // compute label + sort. RLS gates the participant -> trip read.
  const { data: rows, error } = await supabase
    .from('trip_participants')
    .select(
      `trip:trips!inner(id, title, status, starts_at, state, species_targeted)`
    )
    .eq('hunter_id', hunterId)
    .in('trip.status', ['planned', 'active'])
  if (error || !rows) {
    if (error) console.warn('[queries.fetchHunterPendingWalletLinks]', { hunterId, code: error.code, message: error.message })
    return []
  }
  type TripLite = {
    id: string
    title: string
    status: string
    starts_at: string
    state: string | null
    species_targeted: string | null
  }
  const trips: TripLite[] = []
  const seen = new Set<string>()
  for (const r of rows as Array<{ trip: TripLite | null }>) {
    if (!r.trip) continue
    // Defense-in-depth: PostgREST nested .in filters can be flaky.
    if (r.trip.status !== 'planned' && r.trip.status !== 'active') continue
    if (seen.has(r.trip.id)) continue
    seen.add(r.trip.id)
    trips.push(r.trip)
  }
  if (trips.length === 0) return []

  // Pull the hunter's existing wallet-link rows across all those trips
  // in a single query, then bucket by trip_id.
  const tripIds = trips.map((t) => t.id)
  const { data: linkRows, error: linkErr } = await supabase
    .from('trip_wallet_items')
    .select('trip_id, wallet_items!inner(type)')
    .eq('hunter_id', hunterId)
    .in('trip_id', tripIds)
  if (linkErr) {
    console.warn('[queries.fetchHunterPendingWalletLinks.links]', { hunterId, code: linkErr.code, message: linkErr.message })
    return []
  }
  const linkedKindsByTrip = new Map<string, Set<string>>()
  for (const row of (linkRows ?? []) as Array<{ trip_id: string; wallet_items: { type: string } | null }>) {
    const t = row.wallet_items?.type
    if (!t) continue
    const set = linkedKindsByTrip.get(row.trip_id) ?? new Set<string>()
    set.add(t)
    linkedKindsByTrip.set(row.trip_id, set)
  }

  const out: HunterPendingWalletLink[] = []
  for (const trip of trips) {
    const linked = linkedKindsByTrip.get(trip.id) ?? new Set<string>()
    if (!linked.has('license')) {
      out.push({
        trip_id: trip.id,
        trip_title: trip.title,
        trip_starts_at: trip.starts_at,
        trip_state: trip.state,
        kind: 'license',
        species: null,
      })
    }
    if (trip.species_targeted && !linked.has('tag')) {
      out.push({
        trip_id: trip.id,
        trip_title: trip.title,
        trip_starts_at: trip.starts_at,
        trip_state: trip.state,
        kind: 'tag',
        species: trip.species_targeted,
      })
    }
  }
  // Sort by trip start ascending so the most-imminent trip surfaces first.
  out.sort((a, b) => {
    const ta = new Date(a.trip_starts_at).getTime()
    const tb = new Date(b.trip_starts_at).getTime()
    if (ta !== tb) return ta - tb
    // license before tag inside the same trip
    if (a.kind !== b.kind) return a.kind === 'license' ? -1 : 1
    return 0
  })
  return out
}

export type SpeciesOption = { name: string; kind: 'hunting' | 'fishing' }
export async function fetchSpecies(
  kind?: 'hunting' | 'fishing'
): Promise<SpeciesOption[]> {
  const supabase = await createClient()
  let q = supabase
    .from('species')
    .select('common_name, kind')
    .order('kind', { ascending: true })
    .order('common_name', { ascending: true })
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) {
    console.warn('[queries.fetchSpecies]', { code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map((r) => ({
    name: r.common_name as string,
    kind: r.kind as 'hunting' | 'fishing',
  }))
}

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
> & {
  hunters: number
  harvests: number
  // v26.5.9: trip card ratings. Guide queries set rating = AVG across all
  // trip_reviews on this trip + reviewCount = total reviews. Hunter queries
  // set rating = the hunter's OWN review (1-5) + reviewCount = 0|1. Null
  // rating means "not reviewed yet" (or the trip isn't wrapped, in which
  // case the card shouldn't render the row anyway).
  rating: number | null
  reviewCount: number
}

const RECENT_LIMIT = 10

// v25.9.1: shared column list for the row-with-counts shape. Folded into a
// constant so every fetcher stays in sync after the location split.
// v26.3: row shape itself unchanged for the trip lists, but detail queries
// pull species_targeted + method via the dedicated TRIP_DETAIL_COLS.
const TRIP_ROW_COLS = `id, title, status, starts_at, ends_at, location_name, kind, city, state, zone, county`

function shapeTripWithCounts(t: Record<string, unknown>): TripRowWithCounts {
  const tp = t.trip_participants as { count: number }[] | null | undefined
  // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
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
    harvests: 0,
    rating: null,
    reviewCount: 0,
  }
}

// v26.5.9: attach trip-review ratings to a list of trips. We fetch reviews
// in a single IN(tripIds) query and merge in code rather than a Postgres
// view, so the schema stays simple. Wrapped trips that have zero reviews
// keep `rating: null` and the card renders the empty state.
//
// `mode === 'guide-avg'` aggregates across all reviewers on a trip.
// `mode === 'hunter-own'` only fetches the calling hunter's own review.
async function attachRatings<T extends { id: string; status: TripStatus }>(
  rows: T[],
  mode: { kind: 'guide-avg' } | { kind: 'hunter-own'; hunterId: string }
): Promise<(T & { rating: number | null; reviewCount: number })[]> {
  const tripIds = rows.map((r) => r.id)
  if (tripIds.length === 0) {
    return rows.map((r) => ({ ...r, rating: null, reviewCount: 0 }))
  }
  const supabase = await createClient()
  let query = supabase
    .from('trip_reviews')
    .select('trip_id, rating')
    .in('trip_id', tripIds)
  if (mode.kind === 'hunter-own') {
    query = query.eq('hunter_id', mode.hunterId)
  }
  const { data, error } = await query
  if (error) {
    console.warn('[queries.attachRatings]', { mode: mode.kind, code: error.code, message: error.message })
    return rows.map((r) => ({ ...r, rating: null, reviewCount: 0 }))
  }
  const acc = new Map<string, { sum: number; count: number }>()
  for (const r of data ?? []) {
    const e = acc.get(r.trip_id) ?? { sum: 0, count: 0 }
    e.sum += r.rating
    e.count += 1
    acc.set(r.trip_id, e)
  }
  return rows.map((r) => {
    const e = acc.get(r.id)
    if (!e || e.count === 0) return { ...r, rating: null, reviewCount: 0 }
    return { ...r, rating: e.sum / e.count, reviewCount: e.count }
  })
}

// v26.4.1: "Recent" now means trips that have actually wrapped — completed
// or canceled. The previous query returned every trip ordered by starts_at
// desc, which caused the same trip to show up in BOTH the Upcoming widget
// (status=planned/active by date) AND the Recent widget (any status). Now
// the two widgets are a clean status partition. Order by updated_at desc so
// most recently wrapped tops the list.
export async function fetchRecentTrips(guideId: string): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(`${TRIP_ROW_COLS},
             trip_participants(count)`)
    .eq('guide_id', guideId)
    // v27.1.1.0.3a.4: drop canceled from the dashboard Recent widget.
    // Canceled trips are visible only via the trips list CANCELED filter
    // chip — they don't belong on the happy-path dashboard.
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(RECENT_LIMIT)
  if (error) {
    console.warn('[queries.fetchRecentTrips]', { guideId, code: error.code, message: error.message })
    return []
  }
  const shaped = (data ?? []).map(shapeTripWithCounts)
  return attachRatings(shaped, { kind: 'guide-avg' })
}

// v24/v26.4.1: dashboard widget query — trips that haven't been wrapped
// yet (status in {planned, active}). Date no longer matters; a planned trip
// whose starts_at has already passed (guide forgot to activate or wrap) is
// still "upcoming" until the guide closes it out. Order by starts_at asc so
// the soonest next trip tops the list.
export async function fetchUpcomingTrips(
  guideId: string,
  limit = 5
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(`${TRIP_ROW_COLS},
             trip_participants(count)`)
    .eq('guide_id', guideId)
    .in('status', ['planned', 'active'])
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
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(
      `${TRIP_ROW_COLS},
       trip_participants(count)`,
      { count: 'exact' }
    )
    .eq('guide_id', guideId)
    .order('starts_at', { ascending: false })
    .range(opts.from, opts.to)
  // v27.3.3.2 (rolled back v27.6.2): "all" used to mean planned +
  // active only because wrapped trips lived in a Recent rail. v27.5.0.5
  // replaced that rail with a calendar, and "all" reading as "open
  // trips" was confusing — Flavio: "in trips page, 'all' pill is only
  // showing active. It should show all." So now "all" is literally
  // every status. Specific chips (Planned / Active / Done / Canceled)
  // still narrow to one status.
  if (opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }
  const { data, count, error } = await query
  if (error) {
    console.warn('[queries.fetchTripsPage]', { guideId, code: error.code, message: error.message })
    return { rows: [], total: 0 }
  }
  const shaped = (data ?? []).map(shapeTripWithCounts)
  const rows = await attachRatings(shaped, { kind: 'guide-avg' })
  return { rows, total: count ?? 0 }
}

// v27.5.0.5 — calendar query. Returns trips that OVERLAP the date range
// [fromIso, toIso] (inclusive on both ends), filtered by status the same
// way the chip filter on /app/trips does. Overlap rule: the trip's
// start <= range end AND its end (or start, if no ends_at) >= range start.
//
// We deliberately don't paginate here — a typical guide has fewer than
// ~50 trips in a single visible month range, and the calendar needs
// every overlapping trip to render bars correctly.
//
// Status semantics match fetchTripsPage:
//   'all' → planned + active (the OPEN trips view)
//   anything else → just that status
export async function fetchTripsInRange(
  guideId: string,
  fromIso: string,
  toIso: string,
  status: TripStatus | 'all'
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  let query = supabase
    .from('trips')
    .select(`${TRIP_ROW_COLS},
             trip_participants(count)`)
    .eq('guide_id', guideId)
    .lte('starts_at', toIso)
    .or(`ends_at.gte.${fromIso},and(ends_at.is.null,starts_at.gte.${fromIso})`)
    .order('starts_at', { ascending: true })
  // v27.6.2: 'all' = every status (matches the cards list filter).
  // Chip-narrowed views fall through to the single-status branch.
  if (status !== 'all') {
    query = query.eq('status', status)
  }
  const { data, error } = await query
  if (error) {
    console.warn('[queries.fetchTripsInRange]', { guideId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map(shapeTripWithCounts)
}

export type DashboardStats = {
  tripsThisYear: number
  huntersServed: number
  harvests: number
}

export async function fetchDashboardStats(guideId: string): Promise<DashboardStats> {
  const supabase = await createClient()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  // v27.8.1 — harvests count restored. Sums BOTH the guide's own
  // harvests (entries where hunter_id = guide_id, e.g. self-guided
  // outings) AND every client's harvests on guide-owned trips. Pulled
  // via harvest_log_entries → harvest_logs → trips embed; PostgREST
  // nested filter is unreliable so we project trips.guide_id and
  // filter in JS, mirroring the pattern in fetchHunterStats and other
  // v22+ RLS-recursion-aware reads. species rows aren't counted here
  // because each entry can have multiple species — entries are the
  // canonical "harvest event" unit.
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
      .from('harvest_log_entries')
      .select('id, harvest_logs!inner(trips!inner(guide_id, starts_at))'),
  ])

  const huntersServed = new Set(
    (hunterRows.data ?? []).map((r) => r.hunter_id ?? `guest:${r.guest_name ?? ''}`)
  ).size

  // JS-side filter: keep only entries whose harvest_logs.trips.guide_id
  // matches and whose trip starts this calendar year. Counts every
  // entry once — covers the guide's own + every client's harvests
  // because `trips.guide_id = guideId` includes both kinds.
  const harvests = (harvestRows.data ?? []).filter((row) => {
    const log = (row as { harvest_logs?: { trips?: { guide_id?: string; starts_at?: string } } }).harvest_logs
    const trip = log?.trips
    if (!trip || trip.guide_id !== guideId) return false
    return typeof trip.starts_at === 'string' && trip.starts_at >= yearStart
  }).length

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
    /** v27.0b.4.1: live-source display values. wallet_item.species/identifier
     * preferred; harvest snapshot fallback; trip-level fallback last. Read
     * these for display, never the snapshot fields above. */
    species_display: string | null
    tag_number_display: string | null
    method_display: string | null
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

  // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
  const { data: participantsData } = await supabase
    .from('trip_participants')
    .select('id, role, guest_name, hunter_id')
    .eq('trip_id', tripId)

  // Resolve participant hunter names in code rather than via embed.
  // RLS on profiles allows the trip's guide to read participant profiles via
  // the profiles_guide_sees_participants policy.
  const hunterIds = new Set<string>()
  ;(participantsData ?? []).forEach((p) => p.hunter_id && hunterIds.add(p.hunter_id))

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
    participants: (participantsData ?? []).map((p) => ({
      id: p.id,
      role: p.role,
      guest_name: p.guest_name,
      hunter_id: p.hunter_id,
      profile: p.hunter_id ? profilesMap.get(p.hunter_id) ?? null : null,
    })),
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    harvests: [],
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
// v27.0b.2.1: per-hunter tag options for the harvest form. Always returns
// the hunter's FULL active tag inventory; trip_wallet_items is consulted
// only to compute a default selection. The guide can always override.
//
// Returns Map<hunter_id, { tags, default_tag_id }>. default_tag_id is the
// most recently linked trip_wallet_items row that points to one of the
// hunter's currently active tags; null if no link exists or the link
// points to an archived/used/expired tag.
//
// No client-side memoization. The harvest form page is a server component
// that calls this on every render → fresh data on every navigation.
export type HarvestTagOption = {
  id: string
  identifier: string
  species: string | null
  state: string | null
  zone: string | null
  season_year: number | null
  valid_to: string
  /** v27.0b.5: false → multi-use tag (turkey, pig, predator). Form
   * shows a heads-up that the tag won't auto-tag-out on save. */
  single_use: boolean
  /** v27.0b.5.2: pulled from wallet_items.extras.weapon_restriction so
   * the harvest form can auto-fill method on hunter/tag selection
   * matching the same chain queries.ts uses for method_display. Already
   * normalized to canonical method labels. null when "Any" or unset —
   * caller falls through to harvest snapshot / trip default. */
  weapon_restriction: string | null
}

export type HarvestTagOptions = {
  tags: HarvestTagOption[]
  default_tag_id: string | null
}

export async function fetchHarvestTagOptions(
  guideId: string,
  tripId: string,
  hunterIds: string[],
  /**
   * v27.0b.4: include this wallet item in the result even if it's
   * tagged out / archived / expired. Used by the harvest EDIT form so
   * the currently-bound tag (always tagged out — the AFTER INSERT
   * trigger flipped it on harvest creation) stays visible in the picker.
   */
  includeBoundTagId?: string | null
): Promise<Map<string, HarvestTagOptions>> {
  const out = new Map<string, HarvestTagOptions>()
  if (hunterIds.length === 0) return out
  const supabase = await createClient()

  // Verify the guide owns the trip. RLS will also gate the trip_wallet_items
  // read via _is_trip_owner; bailing early on a bad caller is defense-in-depth.
  const { data: trip } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return out

  const today = new Date().toISOString().slice(0, 10)

  // 1. Always-on full inventory: every active tag for each participant
  //    hunter. This is the option list the picker shows.
  // v27.0b.5: include single_use so the form can warn on multi-use tags.
  // For multi-use tags we ALSO need to include rows where tagged_out_at
  // is set on the bound tag (since multi-use tags don't auto-flip), but
  // that's edge-case for the EDIT form; for the picker, active tags only
  // are what's relevant.
  const { data: allTags } = await supabase
    .from('wallet_items')
    .select(
      'id, user_id, identifier, type, species, state, zone, season_year, valid_to, archived_at, tagged_out_at, single_use, extras'
    )
    .in('user_id', hunterIds)
    .eq('type', 'tag')
    .is('archived_at', null)
    .is('tagged_out_at', null)
    .gte('valid_to', today)

  // Index active tag ids per hunter so we can validate the link below.
  const activeByHunter = new Map<string, Set<string>>()
  for (const w of allTags ?? []) {
    const arr = out.get(w.user_id) ?? { tags: [], default_tag_id: null }
    const extras = (w.extras ?? null) as { weapon_restriction?: string } | null
    arr.tags.push({
      id: w.id,
      identifier: w.identifier,
      species: w.species,
      state: w.state,
      zone: w.zone,
      season_year: w.season_year,
      valid_to: w.valid_to,
      single_use: w.single_use,
      weapon_restriction: normalizeWeaponRestriction(extras?.weapon_restriction),
    })
    out.set(w.user_id, arr)
    const set = activeByHunter.get(w.user_id) ?? new Set<string>()
    set.add(w.id)
    activeByHunter.set(w.user_id, set)
  }

  // 2. Trip-linked tags (preferred default). Order by most-recent linked
  //    so the first match per hunter is the freshest pick.
  const { data: linked } = await supabase
    .from('trip_wallet_items')
    .select('hunter_id, wallet_item_id, linked_at')
    .eq('trip_id', tripId)
    .in('hunter_id', hunterIds)
    .order('linked_at', { ascending: false })

  for (const link of linked ?? []) {
    const existing = out.get(link.hunter_id)
    if (!existing || existing.default_tag_id) continue // already set, keep most-recent
    const activeIds = activeByHunter.get(link.hunter_id)
    if (activeIds && activeIds.has(link.wallet_item_id)) {
      existing.default_tag_id = link.wallet_item_id
    }
  }

  // 3. v27.0b.4: include the bound tag (regardless of tagged_out_at /
  //    archived_at / expired) so the edit form can show what's currently
  //    selected. Without this, the trigger-flipped tag disappears from
  //    the picker the moment the harvest is logged.
  if (includeBoundTagId) {
    const { data: bound } = await supabase
      .from('wallet_items')
      .select('id, user_id, identifier, type, species, state, zone, season_year, valid_to, single_use, extras')
      .eq('id', includeBoundTagId)
      .eq('type', 'tag')
      .maybeSingle()
    if (bound && hunterIds.includes(bound.user_id)) {
      const existing = out.get(bound.user_id) ?? { tags: [], default_tag_id: null }
      const alreadyPresent = existing.tags.some((t) => t.id === bound.id)
      if (!alreadyPresent) {
        const boundExtras = (bound.extras ?? null) as { weapon_restriction?: string } | null
        existing.tags = [
          {
            id: bound.id,
            identifier: bound.identifier,
            species: bound.species,
            state: bound.state,
            zone: bound.zone,
            season_year: bound.season_year,
            valid_to: bound.valid_to,
            single_use: bound.single_use,
            weapon_restriction: normalizeWeaponRestriction(boundExtras?.weapon_restriction),
          },
          ...existing.tags,
        ]
      }
      // Default to the bound tag for the edit form so the picker shows
      // the current binding pre-selected.
      if (!existing.default_tag_id) existing.default_tag_id = bound.id
      out.set(bound.user_id, existing)
    }
  }

  return out
}

// v27.1.1.0.3a: insertHarvest dropped, real implementation in harvest-log-queries.ts (pending)

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
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count)
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

// v26.5.7: hunter-side Upcoming/Recent split, mirroring the v26.4.1 guide
// dashboard pattern. Upcoming = planned/active by starts_at ASC, Recent =
// completed/canceled by updated_at DESC. Clean status partition so a trip
// can't appear in both widgets.
export async function fetchHunterUpcomingTrips(
  hunterId: string,
  limit = 5
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trip_participants')
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count)
      )`
    )
    .eq('hunter_id', hunterId)
    .in('trip.status', ['planned', 'active'])
    .order('starts_at', { foreignTable: 'trip', ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[queries.fetchHunterUpcomingTrips]', { hunterId, code: error.code, message: error.message })
    return []
  }
  // v27.0b.8: defense-in-depth status filter in JS. Supabase's
  // .in('trip.status', [...]) on an embedded foreign-key resource has
  // had sporadic reliability issues — a canceled trip can leak through
  // and inflate the dashboard's "upcoming" counter. Filter again here
  // so the contract is bullet-proof regardless of the PostgREST nested-
  // filter behavior.
  return (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => {
      if (!t) return false
      const s = (t as { status?: string }).status
      return s === 'planned' || s === 'active'
    })
    .map(shapeHunterTripRow)
}

export async function fetchHunterRecentTrips(
  hunterId: string,
  limit = 5
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trip_participants')
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count)
      )`
    )
    .eq('hunter_id', hunterId)
    // v27.1.1.0.3a.4: Recent widget = completed only. Canceled trips
    // were cluttering the hunter's dashboard and don't belong on the
    // happy path. They remain accessible via the trips list page.
    .eq('trip.status', 'completed')
    .order('updated_at', { foreignTable: 'trip', ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[queries.fetchHunterRecentTrips]', { hunterId, code: error.code, message: error.message })
    return []
  }
  // Defense-in-depth JS filter — PostgREST nested-table filters can be
  // unreliable, and the result shape includes the joined trip on each
  // participant row. Reject anything that slipped through with a
  // non-completed status.
  const shaped = (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => {
      if (!t) return false
      const s = (t as { status?: string }).status
      return s === 'completed'
    })
    .map(shapeHunterTripRow)
  return attachRatings(shaped, { kind: 'hunter-own', hunterId })
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
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    .select(
      `trip:trips!inner(
        ${TRIP_ROW_COLS},
        trip_participants(count)
      )`
    )
    .eq('hunter_id', hunterId)
  // v27.1.1.0.3a.5: ALL filter excludes canceled trips on the hunter
  // trips list, mirroring the guide-side fix.
  if (opts.status === 'all') {
    query = query.in('trip.status', ['planned', 'active', 'completed'])
  } else {
    query = query.eq('trip.status', opts.status)
  }
  const { data, error } = await query
  if (error) {
    console.warn('[queries.fetchHunterTripsPage]', { hunterId, code: error.code, message: error.message })
    return { rows: [], total: 0 }
  }
  const all = (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => !!t)
    // Defense-in-depth: PostgREST nested filters can be unreliable. If
    // ALL is selected, drop canceled here too.
    .filter((t) => {
      if (opts.status !== 'all') return true
      const s = (t as { status?: string }).status
      return s !== 'canceled'
    })
    .map(shapeHunterTripRow)
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
  const total = all.length
  const rows = await attachRatings(all.slice(opts.from, opts.to + 1), { kind: 'hunter-own', hunterId })
  return { rows, total }
}

// v27.6.3.2 — calendar query, hunter side. Mirror of fetchTripsInRange
// but pivots through trip_participants → trips. Returns trips this
// hunter is on that overlap [fromIso, toIso], filtered by the same
// chip-status the cards list uses. status='all' includes every status
// except canceled (mirrors the v27.1.1.0.3a.5 fetchHunterTripsPage
// rule). The component reads `kind`+`status` for activity-driven bar
// colors per v27.6.1.
export async function fetchHunterTripsInRange(
  hunterId: string,
  fromIso: string,
  toIso: string,
  status: TripStatus | 'all',
): Promise<TripRowWithCounts[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trip_participants')
    .select(`trip:trips!inner(${TRIP_ROW_COLS}, trip_participants(count))`)
    .eq('hunter_id', hunterId)
  if (error) {
    console.warn('[queries.fetchHunterTripsInRange]', { hunterId, code: error.code, message: error.message })
    return []
  }
  const fromMs = new Date(fromIso).getTime()
  const toMs = new Date(toIso).getTime()
  const filtered = (data ?? [])
    .map((row) => (row as { trip: Record<string, unknown> | null }).trip)
    .filter((t): t is Record<string, unknown> => !!t)
    .filter((t) => {
      const s = (t as { status?: string }).status
      if (status === 'all') return s !== 'canceled'
      return s === status
    })
    .filter((t) => {
      const startsAt = (t as { starts_at?: string }).starts_at
      const endsAt = (t as { ends_at?: string | null }).ends_at ?? null
      if (!startsAt) return false
      const startMs = new Date(startsAt).getTime()
      const endMs = endsAt ? new Date(endsAt).getTime() : startMs
      // Overlap: trip.start <= range.end AND trip.end >= range.start.
      return startMs <= toMs && endMs >= fromMs
    })
  return filtered.map(shapeHunterTripRow)
}

export type HunterTripDetail = {
  trip: Pick<Trip, 'id' | 'title' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'city' | 'state' | 'zone' | 'county' | 'species_targeted' | 'method' | 'notes'>
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
    /** v27.0b.4.1: live-source display values mirror guide-side TripDetail.
     * wallet_item.species/identifier preferred; harvest snapshot fallback;
     * trip-level fallback last. Read these for display, never the snapshot
     * fields above. */
    species_display: string | null
    tag_number_display: string | null
    method_display: string | null
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
    .select('id, title, kind, status, starts_at, ends_at, location_name, city, state, zone, county, species_targeted, method, notes, guide_id')
    .eq('id', tripId)
    .maybeSingle()
  if (tripErr || !trip) return null

  // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
  const [participantsRes, guideProfileRes, guideBusinessRes] = await Promise.all([
    supabase
      .from('trip_participants')
      .select('id, role, guest_name, hunter_id')
      .eq('trip_id', tripId),
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

  // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)

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
      species_targeted: trip.species_targeted,
      method: trip.method,
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
    // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
    myHarvests: [],
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
  // v27.0b.8.1: include trip.status in the embed so we can exclude
  // canceled trips from the "Trips you've been on" + "Guides" counts.
  // PostgREST nested filtering is unreliable, so we filter in JS after
  // the fetch — same belt-and-suspenders rule as fetchHunterUpcomingTrips.
  // v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending)
  const [participantsRes, harvestsRes] = await Promise.all([
    supabase
      .from('trip_participants')
      .select('trip_id, trips!inner(guide_id, status)')
      .eq('hunter_id', hunterId),
    supabase
      .from('harvest_log_entries')
      .select('id', { count: 'exact', head: true })
      .eq('hunter_id', hunterId),
  ])

  const tripsSet = new Set<string>()
  const guidesSet = new Set<string>()
  ;(participantsRes.data ?? []).forEach((row) => {
    const r = row as {
      trip_id: string
      trips:
        | { guide_id: string; status: string }
        | { guide_id: string; status: string }[]
        | null
    }
    const trips = r.trips
    // Helper: only count this row when the trip status is NOT canceled.
    const include = (t: { guide_id: string; status: string } | null | undefined) => {
      if (!t) return
      if (t.status === 'canceled') return
      tripsSet.add(r.trip_id)
      if (t.guide_id) guidesSet.add(t.guide_id)
    }
    if (Array.isArray(trips)) {
      trips.forEach(include)
    } else {
      include(trips)
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
