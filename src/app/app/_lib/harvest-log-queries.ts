import { createClient } from '@/lib/supabase/server'
import type { Database, TablesInsert } from '@/lib/supabase/types'
import { parseFieldName } from './harvest-log-fill-types'

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
  // v27.3.9: per-entry "Filled at log time" values, keyed by
  // mapping_field_name. The HarvestLogEditor renders these as a
  // "Custom fields" sub-section above "Total hours" on each entry.
  user_inputs: Record<string, string>
}

// v27.3.9: per-doc "Filled at log time" mappings the harvest log
// editor needs to surface as guide-typed inputs. One entry per
// (doc, hunter_slot, mapping_field_name). Populated only for log
// docs the guide can fill from this trip.
// v27.5.0.4.4 — effective slot mirrors the fill engine's slot
// resolution: if the saved hunter_slot is 0, fall back to
// parseFieldName(field_name).slot. This way a guide who marks a "_2"
// suffixed field as user_input.log_time without explicitly setting the
// slot picker still sees the input on Hunter 2's accordion (the fill
// engine already resolved it correctly; the UI was the gap).
export type LogTimeMapping = {
  doc_id: string
  doc_label: string
  field_name: string
  user_label: string
  hunter_slot: number  // saved value: 0 = no manual slot, 1..N = explicit
  /** v27.5.0.4.4 — derived: hunter_slot if > 0 else parseFieldName.slot.
   *  0 = trip-level; 1..N = per-hunter. */
  effective_slot: number
}

export type HarvestLogWithEntries = HarvestLogRow & {
  entries: HarvestLogEntryWithRelations[]
  // v27.3.9: aggregated across every log doc the guide can generate.
  // Editor merges these into per-entry "Custom fields" inputs.
  log_time_mappings: LogTimeMapping[]
  // v27.5.0.4.4 — trip-level "Filled at log time" values keyed by
  // mapping_field_name. Mirror of the per-entry user_inputs map but
  // log-scoped. Populated by fetchHarvestLog.
  user_inputs: Record<string, string>
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

  const [hunterRes, licenseRes, tagRes, speciesRes, userInputsRes] = await Promise.all([
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
          .select('id, entry_id, species, qty_harvested, qty_released, position, tag_identifier, tag_identifier_mode, report_card_identifier, report_card_identifier_mode, created_at, updated_at')
          .in('entry_id', entryIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
    // v27.3.9: per-entry "Filled at log time" values.
    entryIds.length
      ? sb
          .from('harvest_log_entry_user_inputs')
          .select('entry_id, mapping_field_name, value')
          .in('entry_id', entryIds)
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
  // v27.3.9: index user inputs by entry id -> {fieldName: value}.
  type UIRow = { entry_id: string; mapping_field_name: string; value: string | null }
  const userInputsByEntry: Record<string, Record<string, string>> = {}
  for (const r of (userInputsRes.data ?? []) as UIRow[]) {
    if (!userInputsByEntry[r.entry_id]) userInputsByEntry[r.entry_id] = {}
    userInputsByEntry[r.entry_id][r.mapping_field_name] = r.value ?? ''
  }

  const entriesWithRelations: HarvestLogEntryWithRelations[] = rows.map((r) => ({
    ...r,
    hunter: r.hunter_id ? (hunterMap.get(r.hunter_id) ?? null) : null,
    license: r.license_wallet_item_id ? (licenseMap.get(r.license_wallet_item_id) ?? null) : null,
    tag: r.tag_wallet_item_id ? (tagMap.get(r.tag_wallet_item_id) ?? null) : null,
    species_rows: speciesByEntry.get(r.id) ?? [],
    user_inputs: userInputsByEntry[r.id] ?? {},
  }))

  // v27.3.9: log-time mappings aggregated across every log doc the
  // guide could generate against this trip. We fetch ALL their log
  // docs (not just the one selected at generate time) so the editor
  // captures inputs once even if the guide later switches templates.
  const logTimeMappings = await fetchLogTimeMappingsForGuide(sb)

  // v27.5.0.4.4 — trip-level user_input.log_time values, keyed on this
  // log's id. Mirror of the per-entry user_inputs fetch above.
  const { data: logUiRows } = await sb
    .from('harvest_log_user_inputs')
    .select('mapping_field_name, value')
    .eq('log_id', log.id)
  const logUserInputs: Record<string, string> = {}
  for (const r of (logUiRows ?? []) as Array<{ mapping_field_name: string; value: string | null }>) {
    logUserInputs[r.mapping_field_name] = r.value ?? ''
  }

  return {
    ...log,
    entries: entriesWithRelations,
    log_time_mappings: logTimeMappings,
    user_inputs: logUserInputs,
  }
}

// v27.3.9: pull every "Filled at log time" mapping the guide owns
// across their log docs (and Bite Book log templates they might
// generate against). Used by the harvest log editor to surface
// per-entry inputs above "Total hours."
async function fetchLogTimeMappingsForGuide(
  sb: Awaited<ReturnType<typeof createClient>>
): Promise<LogTimeMapping[]> {
  const { data, error } = await sb
    .from('doc_field_mappings')
    .select('doc_id, field_name, user_label, hunter_slot, docs!inner(id, label, kind)')
    .eq('mapping_kind', 'field')
    .eq('data_source_path', 'user_input.log_time')
  if (error) {
    console.warn('[harvest-log.fetchLogTimeMappings]', { code: error.code, message: error.message })
    return []
  }
  type Row = {
    doc_id: string
    field_name: string
    user_label: string | null
    hunter_slot: number
    docs: { id: string; label: string; kind: string } | null
  }
  const out: LogTimeMapping[] = []
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.docs || r.docs.kind !== 'log') continue
    // v27.5.0.4.4 — effective slot mirrors fill engine: manual slot if >0
    // else regex on the field name. This keeps the UI in sync with how
    // the fill engine actually resolves the slot at generate time.
    const manual = r.hunter_slot ?? 0
    const detected = parseFieldName(r.field_name).slot
    const effective = manual > 0 ? manual : detected
    out.push({
      doc_id: r.doc_id,
      doc_label: r.docs.label,
      field_name: r.field_name,
      user_label: r.user_label && r.user_label.trim() ? r.user_label : r.field_name,
      hunter_slot: r.hunter_slot ?? 0,
      effective_slot: effective,
    })
  }
  return out
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

  // v27.9.7.5 — find-or-create the harvest_logs row, then ALWAYS run the
  // entry-sync block. Pre-v27.9.7.5 the early-return on an existing log
  // skipped the entry sync, so any hunter added to the trip AFTER the
  // first /log visit never got a harvest_log_entry. The user-facing
  // symptom: trip with 2 hunters but the Hunt logs page only shows 1.
  // Fix is insert-only: we add entries for participants without one,
  // and we never delete entries for removed participants (preserves
  // any species rows / harvest data the guide already typed).
  let logId: string
  const { data: existing } = await sb
    .from('harvest_logs')
    .select('id')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (existing) {
    logId = existing.id
  } else {
    const { data: created, error: insErr } = await sb
      .from('harvest_logs')
      .insert({ trip_id: tripId, created_by: guideId })
      .select('id')
      .single()
    if (insErr || !created) {
      console.warn('[ensureHarvestLog:insert]', { code: insErr?.code, message: insErr?.message })
      return { error: insErr?.message || 'Could not create harvest log.' }
    }
    logId = created.id
  }

  const { data: parts } = await sb
    .from('trip_participants')
    .select('id, hunter_id, guest_name, added_at')
    .eq('trip_id', tripId)
    .order('added_at', { ascending: true })
  const allParticipants = parts ?? []

  // Diff: find participants without an existing entry. Identity is
  // hunter_id when present, else guest_name (legacy guest entries).
  const { data: existingEntries } = await sb
    .from('harvest_log_entries')
    .select('hunter_id, guest_name')
    .eq('log_id', logId)

  const haveHunterIds = new Set(
    (existingEntries ?? [])
      .map((e) => e.hunter_id)
      .filter((v): v is string => !!v)
  )
  const haveGuestNames = new Set(
    (existingEntries ?? [])
      .filter((e) => !e.hunter_id && e.guest_name)
      .map((e) => e.guest_name as string)
  )

  const participants = allParticipants.filter((p) => {
    if (p.hunter_id) return !haveHunterIds.has(p.hunter_id)
    if (p.guest_name) return !haveGuestNames.has(p.guest_name)
    return false
  })

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

// v27.1.1.0.3e.3 — generated PDF rows for a trip. One row per fill pass,
// freshest first. Each comes pre-signed for 1h so the editor can render
// Open / Download buttons directly.
export type TripGeneratedLog = {
  id: string
  trip_id: string
  log_id: string | null
  source_doc_id: string | null
  file_path: string
  file_name: string
  page_count: number | null
  pass_index: number
  pass_total: number
  created_at: string
  // v27.1.3.0.4: trip_generated_logs.updated_at (set by trigger on
  // every UPDATE — i.e. every Re-generate). UI displays whichever
  // timestamp is newer with a "Generated"/"Updated" prefix.
  updated_at: string
  signed_url: string
  // v27.2.0.1: signed copy. Populated when the guide has signed the
  // generated PDF. signed_url_signed is a separate signed URL pointing
  // at the bb-private/signed/{guide}/{trip}/... object so Open /
  // Download switch to the signed copy when present.
  signed_at: string | null
  signed_file_path: string | null
  signed_file_name: string | null
  signed_url_signed: string | null
}

export async function fetchTripGeneratedLogs(tripId: string): Promise<TripGeneratedLog[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_generated_logs')
    .select(
      'id, trip_id, log_id, source_doc_id, file_path, file_name, page_count, pass_index, pass_total, created_at, updated_at, signed_at, signed_file_path, signed_file_name'
    )
    .eq('trip_id', tripId)
    // v27.1.3.0.4: order by whichever is newer so a re-generated PDF
    // floats to the top of the Reports list.
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[fetchTripGeneratedLogs]', { code: error.code, message: error.message })
    return []
  }
  const rows = data ?? []
  if (rows.length === 0) return []

  // Sign URLs in parallel. Best-effort — if a row's storage object is
  // gone, signed_url is empty and the UI shows a disabled state.
  // v27.2.0.1: also sign the signed-PDF copy when present so the UI
  // can flip Open / Download to the executed version.
  const signed = await Promise.all(
    rows.map(async (r) => {
      const baseUrlPromise = sb.storage.from('bb-private').createSignedUrl(r.file_path, 3600)
      const signedUrlPromise = r.signed_file_path
        ? sb.storage.from('bb-private').createSignedUrl(r.signed_file_path, 3600)
        : Promise.resolve({ data: null })
      const [baseRes, signedRes] = await Promise.all([baseUrlPromise, signedUrlPromise])
      return {
        ...r,
        signed_url: baseRes.data?.signedUrl ?? '',
        signed_url_signed: signedRes.data?.signedUrl ?? null,
      } as TripGeneratedLog
    })
  )
  return signed
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
