'use server'

// v27.1.1.0.3a — harvest log CRUD. The PDF generation engine
// (generateFilledHarvestLogPDFsAction) lands in v27.1.1.0.3b.
//
// Locked decisions baked in here:
//   - generateHarvestLogAction is idempotent: existing log → return its id;
//     missing → create one row + one entry per trip_participants row, with
//     license + tag auto-linked from trip_wallet_items (most recently
//     linked of each type for the participant), and phone + address
//     snapshotted from the participant's profile.
//   - The DB trigger _on_harvest_log_entry_consume_tag handles tag-out on
//     INSERT/UPDATE and un-tag on DELETE/UPDATE-changing-tag, so server
//     actions don't double-write the wallet's tagged_out_at field.

import { revalidatePath } from 'next/cache'
import { requireGuide } from './auth'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert, TablesUpdate } from '@/lib/supabase/types'

type EntryUpdate = TablesUpdate<'harvest_log_entries'>
type EntryInsert = TablesInsert<'harvest_log_entries'>

export type HarvestLogActionResult =
  | { ok: true; id: string }
  | { error: string }

// ── generateHarvestLogAction ─────────────────────────────────────────────

export async function generateHarvestLogAction(
  tripId: string
): Promise<HarvestLogActionResult> {
  const { profile } = await requireGuide()
  if (!tripId) return { error: 'Missing trip id.' }

  const sb = await createClient()

  const { data: trip } = await sb
    .from('trips')
    .select('id, guide_id')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  // Idempotent: if a log already exists for this trip, return its id.
  const { data: existing } = await sb
    .from('harvest_logs')
    .select('id')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (existing) {
    return { ok: true, id: existing.id }
  }

  // Create the log.
  const { data: created, error: insErr } = await sb
    .from('harvest_logs')
    .insert({ trip_id: tripId, created_by: profile.id })
    .select('id')
    .single()
  if (insErr || !created) {
    console.warn('[harvestLog.generate:insert]', { code: insErr?.code, message: insErr?.message })
    return { error: insErr?.message || 'Could not create harvest log.' }
  }
  const logId = created.id

  // Pull participants in stable order (added_at).
  const { data: parts } = await sb
    .from('trip_participants')
    .select('id, hunter_id, guest_name, added_at')
    .eq('trip_id', tripId)
    .order('added_at', { ascending: true })
  const participants = parts ?? []

  if (participants.length > 0) {
    // Fetch trip_wallet_items joined to wallet_items for each participant
    // so we can pre-link license + tag. trip_wallet_items doesn't carry
    // type, so we join wallet_items.
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

    // Most-recent license + tag per hunter. Rows are ordered desc by
    // linked_at, so the first match wins.
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

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p])
    )

    const inserts: EntryInsert[] = participants.map((p) => {
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
      console.warn('[harvestLog.generate:entries]', {
        code: entryErr.code,
        message: entryErr.message,
      })
      // Don't fail the whole action — the log row is in place; guide can
      // hand-add entries from the editor if auto-create partially failed.
    }
  }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/trips/${tripId}/log`)
  revalidatePath(`/app/h/trips/${tripId}`)
  return { ok: true, id: logId }
}

// ── updateHarvestLogAction (trip-level fields) ──────────────────────────

export async function updateHarvestLogAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireGuide()
  const logId = String(formData.get('log_id') ?? '').trim()
  if (!logId) return { error: 'Missing log id.' }

  const logDate = String(formData.get('log_date') ?? '').trim() || null
  const totalHoursRaw = String(formData.get('total_hours') ?? '').trim()
  const totalHours = totalHoursRaw ? Number(totalHoursRaw) : null
  if (totalHours !== null && !Number.isFinite(totalHours)) {
    return { error: 'Total hours must be a number.' }
  }
  const purposeRaw = formData.getAll('trip_purpose').map((v) => String(v).trim()).filter(Boolean)
  const purpose = purposeRaw.length > 0 ? purposeRaw : null

  const sb = await createClient()

  // Verify the log belongs to a trip the guide owns. RLS enforces the
  // same; the .select returns the trip_id we revalidate below.
  const { data: log } = await sb
    .from('harvest_logs')
    .select('id, trip_id')
    .eq('id', logId)
    .maybeSingle()
  if (!log) return { error: 'Harvest log not found.' }

  const { error } = await sb
    .from('harvest_logs')
    .update({
      log_date: logDate,
      total_hours: totalHours,
      trip_purpose: purpose,
    })
    .eq('id', logId)
  if (error) {
    console.warn('[harvestLog.update]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save.' }
  }

  revalidatePath(`/app/trips/${log.trip_id}`)
  revalidatePath(`/app/trips/${log.trip_id}/log`)
  revalidatePath(`/app/h/trips/${log.trip_id}`)
  void profile
  return { ok: true }
}

// ── updateHarvestLogEntryAction ─────────────────────────────────────────

export async function updateHarvestLogEntryAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  await requireGuide()

  const entryId = String(formData.get('entry_id') ?? '').trim()
  if (!entryId) return { error: 'Missing entry id.' }

  const num = (k: string): number | null => {
    const v = String(formData.get(k) ?? '').trim()
    if (!v) return 0
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  const qHarv = num('qty_harvested')
  const qKept = num('qty_kept')
  const qRel = num('qty_released')
  if (qHarv === null || qKept === null || qRel === null) {
    return { error: 'Quantities must be non-negative whole numbers.' }
  }
  const notes = String(formData.get('notes') ?? '').trim() || null
  const includeInReport = formData.get('include_in_report') === 'on'

  // Optional override of license / tag (guide can re-pick from their
  // already-linked wallet items via trip_wallet_items). Empty string =
  // unset.
  const licenseRaw = String(formData.get('license_wallet_item_id') ?? '').trim()
  const tagRaw = String(formData.get('tag_wallet_item_id') ?? '').trim()

  const update: EntryUpdate = {
    qty_harvested: qHarv,
    qty_kept: qKept,
    qty_released: qRel,
    notes,
    include_in_report: includeInReport,
  }
  if (licenseRaw === 'NULL') update.license_wallet_item_id = null
  else if (licenseRaw) update.license_wallet_item_id = licenseRaw
  if (tagRaw === 'NULL') update.tag_wallet_item_id = null
  else if (tagRaw) update.tag_wallet_item_id = tagRaw

  const sb = await createClient()
  const { data: entry } = await sb
    .from('harvest_log_entries')
    .select('id, log_id, harvest_logs!inner(trip_id)')
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) return { error: 'Entry not found.' }
  const tripId = (entry as unknown as { harvest_logs: { trip_id: string } }).harvest_logs.trip_id

  const { error } = await sb
    .from('harvest_log_entries')
    .update(update)
    .eq('id', entryId)
  if (error) {
    console.warn('[harvestLog.updateEntry]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save entry.' }
  }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/trips/${tripId}/log`)
  revalidatePath(`/app/h/trips/${tripId}`)
  return { ok: true }
}

// ── multi-species CRUD ──────────────────────────────────────────────────

export async function addEntrySpeciesAction(
  entryId: string
): Promise<{ ok: true; id: string } | { error: string }> {
  await requireGuide()
  if (!entryId) return { error: 'Missing entry id.' }
  const sb = await createClient()

  // Position = max(position) + 1 for stable ordering.
  const { data: max } = await sb
    .from('harvest_log_entry_species')
    .select('position')
    .eq('entry_id', entryId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPos = (max?.position ?? -1) + 1

  const { data, error } = await sb
    .from('harvest_log_entry_species')
    .insert({ entry_id: entryId, position: nextPos })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[harvestLog.addSpecies]', { code: error?.code, message: error?.message })
    return { error: error?.message || 'Could not add species row.' }
  }

  // Bust the trip page that hosts this log — we don't have trip_id here
  // without another query, so revalidate the broader /app/trips area.
  revalidatePath('/app/trips', 'layout')
  return { ok: true, id: data.id }
}

export async function updateEntrySpeciesAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  await requireGuide()
  const speciesId = String(formData.get('species_id') ?? '').trim()
  if (!speciesId) return { error: 'Missing species row id.' }

  const num = (k: string): number | null => {
    const v = String(formData.get(k) ?? '').trim()
    if (!v) return 0
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  const qHarv = num('qty_harvested')
  const qKept = num('qty_kept')
  const qRel = num('qty_released')
  if (qHarv === null || qKept === null || qRel === null) {
    return { error: 'Quantities must be non-negative whole numbers.' }
  }
  const species = String(formData.get('species') ?? '').trim() || null

  const sb = await createClient()
  const { error } = await sb
    .from('harvest_log_entry_species')
    .update({ species, qty_harvested: qHarv, qty_kept: qKept, qty_released: qRel })
    .eq('id', speciesId)
  if (error) {
    console.warn('[harvestLog.updateSpecies]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save species row.' }
  }

  revalidatePath('/app/trips', 'layout')
  return { ok: true }
}

export async function removeEntrySpeciesAction(
  speciesId: string
): Promise<{ ok: true } | { error: string }> {
  await requireGuide()
  if (!speciesId) return { error: 'Missing species row id.' }
  const sb = await createClient()
  const { error } = await sb.from('harvest_log_entry_species').delete().eq('id', speciesId)
  if (error) {
    console.warn('[harvestLog.removeSpecies]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not remove species row.' }
  }
  revalidatePath('/app/trips', 'layout')
  return { ok: true }
}
