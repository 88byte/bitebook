import { createClient } from '@/lib/supabase/server'
import type { Database, TablesInsert } from '@/lib/supabase/types'

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
    .select('id, trip_id, created_by, log_date, trip_purpose, created_at, updated_at')
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
      'id, log_id, hunter_id, guest_name, license_wallet_item_id, tag_wallet_item_id, total_hours, notes, include_in_report, hunter_phone_snapshot, hunter_address_snapshot, created_at, updated_at'
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
          .select('id, entry_id, species, qty_harvested, qty_released, position, created_at, updated_at')
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

// v27.1.1.0.3a.1 — render-safe bootstrap. Idempotent ensure-or-create
// for the harvest_log + auto-populated entries. Does NOT call
// revalidatePath, so it's safe to invoke from a server component
// render. The 'use server' generateHarvestLogAction wraps this for
// client-triggered flows where revalidate matters.
//
// The error flash on /app/trips/[id]/log first-visit was caused by
// calling generateHarvestLogAction (a server action with
// revalidatePath inside) from the page render. Next.js can't cleanly
// reconcile a revalidate fired during render, so the user briefly
// saw the error boundary before the redirect resolved. Pulling this
// helper out of the 'use server' module fixes that — the page render
// now does plain DB work and never invokes a server action.

export type EnsureHarvestLogResult =
  | { ok: true; id: string }
  | { error: string }

export async function ensureHarvestLog(
  tripId: string,
  guideId: string
): Promise<EnsureHarvestLogResult> {
  if (!tripId) return { error: 'Missing trip id.' }

  const sb = await createClient()

  const { data: trip } = await sb
    .from('trips')
    .select('id, guide_id')
    .eq('id', tripId)
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  const { data: existing } = await sb
    .from('harvest_logs')
    .select('id')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (existing) return { ok: true, id: existing.id }

  const { data: created, error: insErr } = await sb
    .from('harvest_logs')
    .insert({ trip_id: tripId, created_by: guideId })
    .select('id')
    .single()
  if (insErr || !created) {
    console.warn('[ensureHarvestLog:insert]', { code: insErr?.code, message: insErr?.message })
    return { error: insErr?.message || 'Could not create harvest log.' }
  }
  const logId = created.id

  const { data: parts } = await sb
    .from('trip_participants')
    .select('id, hunter_id, guest_name, added_at')
    .eq('trip_id', tripId)
    .order('added_at', { ascending: true })
  const participants = parts ?? []

  if (participants.length > 0) {
    const hunterIds = participants
      .map((p) => p.hunter_id)
      .filter((x): x is string => !!x)

    const [twiRes, profilesRes] = await Promise.all([
      hunterIds.length
        ? sb
            .from('trip_wallet_items')
            .select(
              'hunter_id, wallet_item_id, linked_at, wallet_items!inner(id, type)'
            )
            .eq('trip_id', tripId)
            .in('hunter_id', hunterIds)
            .order('linked_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      hunterIds.length
        ? sb
            .from('profiles')
            .select(
              'id, phone, address_street, address_street2, address_city, address_state, address_zip'
            )
            .in('id', hunterIds)
        : Promise.resolve({ data: [] }),
    ])

    type TwiRow = {
      hunter_id: string
      wallet_item_id: string
      linked_at: string
      wallet_items: { id: string; type: string }
    }
    const twiRows: TwiRow[] = (twiRes.data ?? []) as TwiRow[]

    const licenseByHunter = new Map<string, string>()
    const tagByHunter = new Map<string, string>()
    for (const r of twiRows) {
      if (r.wallet_items.type === 'license' && !licenseByHunter.has(r.hunter_id)) {
        licenseByHunter.set(r.hunter_id, r.wallet_items.id)
      }
      if (r.wallet_items.type === 'tag' && !tagByHunter.has(r.hunter_id)) {
        tagByHunter.set(r.hunter_id, r.wallet_items.id)
      }
    }

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]))

    const inserts: TablesInsert<'harvest_log_entries'>[] = participants.map((p) => {
      const profileRow = p.hunter_id ? profileMap.get(p.hunter_id) : null
      const license = p.hunter_id ? licenseByHunter.get(p.hunter_id) ?? null : null
      const tag = p.hunter_id ? tagByHunter.get(p.hunter_id) ?? null : null
      const address = profileRow
        ? {
            street1: profileRow.address_street ?? null,
            street2: profileRow.address_street2 ?? null,
            city: profileRow.address_city ?? null,
            state: profileRow.address_state ?? null,
            postal_code: profileRow.address_zip ?? null,
          }
        : null
      return {
        log_id: logId,
        hunter_id: p.hunter_id,
        guest_name: p.hunter_id ? null : p.guest_name,
        license_wallet_item_id: license,
        tag_wallet_item_id: tag,
        hunter_phone_snapshot: profileRow?.phone ?? null,
        hunter_address_snapshot: address,
      }
    })

    const { error: entryErr } = await sb.from('harvest_log_entries').insert(inserts)
    if (entryErr) {
      console.warn('[ensureHarvestLog:entries]', {
        code: entryErr.code,
        message: entryErr.message,
      })
      // Don't fail the whole bootstrap — log row is in place.
    }
  }

  return { ok: true, id: logId }
}

// v27.1.1.0.3b: log-type docs the guide has mapped that can be used as
// fill templates. mapping_status must be 'partial' or 'complete' (we
// allow partial so a guide can fill the fields they've set up even if
// the rest of the form isn't fully mapped). Resource and waiver docs
// are skipped — only logs.
//
// v27.1.1.0.3e.2: also surfaces Bite Book templates (is_template=true,
// any owner) so a guide can fill against a curated template without
// having uploaded their own copy. Owner field exposed so the picker
// can render a "Bite Book template" vs "your library" badge.
export type MappedLogDoc = {
  id: string
  label: string
  state: string | null
  mapping_status: string
  guide_id: string
  is_template: boolean
}

export async function fetchMappedLogDocs(guideId: string): Promise<MappedLogDoc[]> {
  const sb = await createClient()
  // RLS handles the visibility: owner sees their own rows via
  // docs_guide_self_all, anyone sees is_template=true rows via
  // docs_template_select. The OR below is the explicit predicate so
  // PostgREST plans a single-statement query rather than a UNION.
  const { data, error } = await sb
    .from('docs')
    .select('id, label, state, mapping_status, guide_id, is_template')
    .or(`guide_id.eq.${guideId},is_template.eq.true`)
    .eq('kind', 'log')
    .is('archived_at', null)
    .in('mapping_status', ['partial', 'complete'])
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[fetchMappedLogDocs]', { code: error.code, message: error.message })
    return []
  }
  return data ?? []
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
