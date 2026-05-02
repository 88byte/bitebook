import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// v27.1.1.0.3a — read paths for the harvest_logs / harvest_log_entries /
// harvest_log_entry_species pivot. The fill engine (v27.1.1.0.3b) consumes
// the same shapes.

export type HarvestLogRow = Database['public']['Tables']['harvest_logs']['Row']
export type HarvestLogEntryRow = Database['public']['Tables']['harvest_log_entries']['Row']
export type HarvestLogEntrySpeciesRow = Database['public']['Tables']['harvest_log_entry_species']['Row']

export type HarvestLogEntryWithRelations = HarvestLogEntryRow & {
  hunter: { id: string; display_name: string; phone: string | null; address_street: string | null; address_street2: string | null; address_city: string | null; address_state: string | null; address_zip: string | null } | null
  license: { id: string; identifier: string; state: string | null; valid_to: string } | null
  tag: { id: string; identifier: string; species: string | null; state: string | null; zone: string | null } | null
  species_rows: HarvestLogEntrySpeciesRow[]
}

export type HarvestLogWithEntries = HarvestLogRow & {
  entries: HarvestLogEntryWithRelations[]
}

export async function fetchHarvestLog(
  tripId: string
): Promise<HarvestLogWithEntries | null> {
  const sb = await createClient()
  const { data: log, error: logErr } = await sb
    .from('harvest_logs')
    .select('id, trip_id, created_by, log_date, total_hours, trip_purpose, created_at, updated_at')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (logErr) {
    console.warn('[harvest-log.fetchHarvestLog]', { code: logErr.code, message: logErr.message })
    return null
  }
  if (!log) return null

  const { data: entries } = await sb
    .from('harvest_log_entries')
    .select(
      'id, log_id, hunter_id, guest_name, license_wallet_item_id, tag_wallet_item_id, qty_harvested, qty_kept, qty_released, notes, include_in_report, hunter_phone_snapshot, hunter_address_snapshot, created_at, updated_at'
    )
    .eq('log_id', log.id)
    .order('created_at', { ascending: true })
  const rows = (entries ?? []) as HarvestLogEntryRow[]

  const hunterIds = Array.from(new Set(rows.map((r) => r.hunter_id).filter((x): x is string => !!x)))
  const licenseIds = Array.from(new Set(rows.map((r) => r.license_wallet_item_id).filter((x): x is string => !!x)))
  const tagIds = Array.from(new Set(rows.map((r) => r.tag_wallet_item_id).filter((x): x is string => !!x)))
  const entryIds = rows.map((r) => r.id)

  const [hunterRes, licenseRes, tagRes, speciesRes] = await Promise.all([
    hunterIds.length
      ? sb.from('profiles').select('id, display_name, phone, address_street, address_street2, address_city, address_state, address_zip').in('id', hunterIds)
      : Promise.resolve({ data: [] }),
    licenseIds.length
      ? sb.from('wallet_items').select('id, identifier, state, valid_to').in('id', licenseIds)
      : Promise.resolve({ data: [] }),
    tagIds.length
      ? sb.from('wallet_items').select('id, identifier, species, state, zone').in('id', tagIds)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? sb.from('harvest_log_entry_species')
          .select('id, entry_id, species, qty_harvested, qty_kept, qty_released, position, created_at, updated_at')
          .in('entry_id', entryIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const hunterMap = new Map((hunterRes.data ?? []).map((h) => [h.id, h]))
  const licenseMap = new Map((licenseRes.data ?? []).map((w) => [w.id, w]))
  const tagMap = new Map((tagRes.data ?? []).map((w) => [w.id, w]))
  const speciesByEntry = new Map<string, HarvestLogEntrySpeciesRow[]>()
  for (const s of (speciesRes.data ?? []) as HarvestLogEntrySpeciesRow[]) {
    const arr = speciesByEntry.get(s.entry_id) ?? []
    arr.push(s)
    speciesByEntry.set(s.entry_id, arr)
  }

  const entriesWithRelations: HarvestLogEntryWithRelations[] = rows.map((r) => ({
    ...r,
    hunter: r.hunter_id ? (hunterMap.get(r.hunter_id) ?? null) : null,
    license: r.license_wallet_item_id ? (licenseMap.get(r.license_wallet_item_id) ?? null) : null,
    tag: r.tag_wallet_item_id ? (tagMap.get(r.tag_wallet_item_id) ?? null) : null,
    species_rows: speciesByEntry.get(r.id) ?? [],
  }))

  return { ...log, entries: entriesWithRelations }
}

export type HarvestLogSummary = {
  exists: boolean
  total_entries: number
  included_entries: number
  excluded_entries: number
}

export async function fetchHarvestLogSummary(tripId: string): Promise<HarvestLogSummary> {
  const sb = await createClient()
  const { data: log } = await sb
    .from('harvest_logs')
    .select('id')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (!log) return { exists: false, total_entries: 0, included_entries: 0, excluded_entries: 0 }

  const { data: entries } = await sb
    .from('harvest_log_entries')
    .select('id, include_in_report')
    .eq('log_id', log.id)
  const rows = entries ?? []
  const total = rows.length
  const included = rows.filter((r) => r.include_in_report).length
  return {
    exists: true,
    total_entries: total,
    included_entries: included,
    excluded_entries: total - included,
  }
}
