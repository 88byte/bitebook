// v28.1.0f.1 Sprint 3.4b — calendar query helpers.
//
// Two read shapes for /app/calendar:
//
// fetchPersonalCalendarTrips(guideId, range): every trip the guide is
// on (either via trip_guides assignment or the legacy trips.guide_id
// producing-guide path). Source-tagged so the UI can color outfitter
// vs personal differently. Pure guides naturally see only personal;
// network guides see both.
//
// fetchOrgCalendarTrips(orgId, range, guideFilter): every trip in the
// org's books for the visible window, with the assigned guide ids so
// the UI can color-by-guide.
//
// Range filter is "starts_at within [start, end)" — open-ended trips
// surface when their starts_at is in the window. End coverage of
// multi-day trips is a 3.4c polish (currently we render the chip on
// the start day only; multi-day stripe spans are not in 3.4b scope).

import { createAdminClient } from '@/lib/supabase/admin'

export type CalendarTrip = {
  id: string
  title: string
  status: string
  starts_at: string
  ends_at: string | null
  state: string
  outfitter_org_id: string | null
  guide_ids: string[]
}

export type CalendarTripWithSource = CalendarTrip & {
  /** 'outfitter' if outfitter_org_id is one of the viewer's covered orgs, else 'personal'. */
  source: 'outfitter' | 'personal'
}

const CAL_STATUSES = ['planned', 'active', 'completed'] as const

async function attachGuideIds(
  admin: ReturnType<typeof createAdminClient>,
  tripIds: string[],
): Promise<Map<string, string[]>> {
  if (tripIds.length === 0) return new Map()
  const { data } = await admin
    .from('trip_guides')
    .select('trip_id, guide_profile_id, role')
    .in('trip_id', tripIds)
  const out = new Map<string, string[]>()
  for (const r of data ?? []) {
    const existing = out.get(r.trip_id) ?? []
    // Lead first, then assists, so the legend color picks the lead.
    if (r.role === 'lead') existing.unshift(r.guide_profile_id)
    else existing.push(r.guide_profile_id)
    out.set(r.trip_id, existing)
  }
  return out
}

/**
 * Personal calendar feed: trips assigned to the viewing guide via
 * trip_guides OR matched to the legacy trips.guide_id column. Source
 * tagged based on whether the trip's outfitter_org_id is one of the
 * viewer's covered orgs (owner/admin membership OR active network
 * membership).
 */
export async function fetchPersonalCalendarTrips(
  guideId: string,
  range: { startISO: string; endISO: string },
): Promise<CalendarTripWithSource[]> {
  const admin = createAdminClient()

  // Trip ids the user is on via trip_guides.
  const { data: tgRows } = await admin
    .from('trip_guides')
    .select('trip_id')
    .eq('guide_profile_id', guideId)
  const tgIds = new Set<string>((tgRows ?? []).map((r) => r.trip_id as string))

  // Legacy producing-guide hits. Union with tg ids.
  const { data: rawTrips } = await admin
    .from('trips')
    .select('id, title, status, starts_at, ends_at, state, outfitter_org_id, guide_id')
    .or(`guide_id.eq.${guideId},id.in.(${Array.from(tgIds).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .gte('starts_at', range.startISO)
    .lt('starts_at', range.endISO)
    .in('status', [...CAL_STATUSES])

  const tripIds = (rawTrips ?? []).map((t) => t.id as string)
  const guideMap = await attachGuideIds(admin, tripIds)

  // Compute covered org ids once so we can source-tag without N round trips.
  const coveredOrgIds = await fetchCoveredOrgIdsForGuide(admin, guideId)

  return (rawTrips ?? []).map((t): CalendarTripWithSource => ({
    id: t.id as string,
    title: t.title as string,
    status: t.status as string,
    starts_at: t.starts_at as string,
    ends_at: (t.ends_at as string) ?? null,
    state: t.state as string,
    outfitter_org_id: (t.outfitter_org_id as string) ?? null,
    guide_ids: guideMap.get(t.id as string) ?? [],
    source:
      t.outfitter_org_id && coveredOrgIds.has(t.outfitter_org_id as string)
        ? 'outfitter'
        : 'personal',
  }))
}

/**
 * Outfitter calendar feed: every trip in the given org's window.
 * Optionally narrowed to a single guide via guideFilter.
 */
export async function fetchOrgCalendarTrips(
  orgId: string,
  range: { startISO: string; endISO: string },
  guideFilter?: string | null,
): Promise<CalendarTrip[]> {
  const admin = createAdminClient()

  const { data: rawTrips } = await admin
    .from('trips')
    .select('id, title, status, starts_at, ends_at, state, outfitter_org_id')
    .eq('outfitter_org_id', orgId)
    .gte('starts_at', range.startISO)
    .lt('starts_at', range.endISO)
    .in('status', [...CAL_STATUSES])
    .order('starts_at', { ascending: true })

  const tripIds = (rawTrips ?? []).map((t) => t.id as string)
  const guideMap = await attachGuideIds(admin, tripIds)

  let result: CalendarTrip[] = (rawTrips ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    status: t.status as string,
    starts_at: t.starts_at as string,
    ends_at: (t.ends_at as string) ?? null,
    state: t.state as string,
    outfitter_org_id: (t.outfitter_org_id as string) ?? null,
    guide_ids: guideMap.get(t.id as string) ?? [],
  }))

  if (guideFilter) {
    result = result.filter((t) => t.guide_ids.includes(guideFilter))
  }
  return result
}

/** List of every guide in the org's network plus admins, for the color legend + filter. */
export async function fetchOrgGuideRoster(
  orgId: string,
): Promise<Array<{ profile_id: string; display_name: string }>> {
  const admin = createAdminClient()

  const [netRes, ownerRes] = await Promise.all([
    admin
      .from('outfitter_guide_network')
      .select('guide_profile_id')
      .eq('org_id', orgId)
      .eq('status', 'active'),
    admin
      .from('outfitter_orgs')
      .select('owner_profile_id')
      .eq('id', orgId)
      .maybeSingle(),
  ])

  const ids = new Set<string>((netRes.data ?? []).map((r) => r.guide_profile_id as string))
  if (ownerRes.data?.owner_profile_id) ids.add(ownerRes.data.owner_profile_id as string)
  const idList = Array.from(ids)
  if (idList.length === 0) return []

  const { data: profs } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', idList)
  return (profs ?? []).map((p) => ({
    profile_id: p.id as string,
    display_name: (p.display_name as string) || 'Guide',
  }))
}

async function fetchCoveredOrgIdsForGuide(
  admin: ReturnType<typeof createAdminClient>,
  guideId: string,
): Promise<Set<string>> {
  const [memRes, netRes] = await Promise.all([
    admin
      .from('outfitter_org_members')
      .select('org_id, role')
      .eq('profile_id', guideId)
      .is('removed_at', null),
    admin
      .from('outfitter_guide_network')
      .select('org_id')
      .eq('guide_profile_id', guideId)
      .eq('status', 'active'),
  ])
  const out = new Set<string>()
  for (const r of memRes.data ?? []) out.add(r.org_id as string)
  for (const r of netRes.data ?? []) out.add(r.org_id as string)
  return out
}
