'use server'

// v27.1.1.0.3a   — harvest log CRUD.
// v27.1.1.0.3a.1 — total_hours moves from log-level to entry-level.
//                  Generate action delegates to ensureHarvestLog (a plain
//                  helper in harvest-log-queries.ts) so the log page render
//                  doesn't trigger revalidatePath from inside a render
//                  pass — that was the source of the v27.1.1.0.3a error
//                  flash on first visit. New deleteHarvestLogAction lets
//                  guides reset and start over.
//
// Tag-out semantics: still 100% DB-driven via
// _on_harvest_log_entry_consume_tag (set on INSERT/UPDATE if single_use,
// un-set on DELETE/UPDATE-changing-tag with reference counting).

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from './auth'
import { createClient } from '@/lib/supabase/server'
import { ensureHarvestLog } from './harvest-log-queries'
import type { TablesUpdate } from '@/lib/supabase/types'

type EntryUpdate = TablesUpdate<'harvest_log_entries'>

export type HarvestLogActionResult =
  | { ok: true; id: string }
  | { error: string }

// ── generateHarvestLogAction ─────────────────────────────────────────────

export async function generateHarvestLogAction(
  tripId: string
): Promise<HarvestLogActionResult> {
  const { profile } = await requireGuide()
  const res = await ensureHarvestLog(tripId, profile.id)
  if ('error' in res) return res

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/trips/${tripId}/log`)
  revalidatePath(`/app/h/trips/${tripId}`)
  return res
}

// ── updateHarvestLogAction (trip-level fields) ──────────────────────────

export async function updateHarvestLogAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  await requireGuide()
  const logId = String(formData.get('log_id') ?? '').trim()
  if (!logId) return { error: 'Missing log id.' }

  const logDate = String(formData.get('log_date') ?? '').trim() || null
  // v27.1.1.0.3a.1: total_hours dropped from the log row entirely; it
  // lives on harvest_log_entries now.
  const purposeRaw = formData.getAll('trip_purpose').map((v) => String(v).trim()).filter(Boolean)
  const purpose = purposeRaw.length > 0 ? purposeRaw : null

  const sb = await createClient()

  const { data: log } = await sb
    .from('harvest_logs')
    .select('id, trip_id')
    .eq('id', logId)
    .maybeSingle()
  if (!log) return { error: 'Harvest log not found.' }

  const { error } = await sb
    .from('harvest_logs')
    .update({ log_date: logDate, trip_purpose: purpose })
    .eq('id', logId)
  if (error) {
    console.warn('[harvestLog.update]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save.' }
  }

  revalidatePath(`/app/trips/${log.trip_id}`)
  revalidatePath(`/app/trips/${log.trip_id}/log`)
  revalidatePath(`/app/h/trips/${log.trip_id}`)
  return { ok: true }
}

// ── updateHarvestLogEntryAction ─────────────────────────────────────────

export async function updateHarvestLogEntryAction(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  await requireGuide()

  const entryId = String(formData.get('entry_id') ?? '').trim()
  if (!entryId) return { error: 'Missing entry id.' }

  // v27.1.1.0.3a.3: entry-level qty fields dropped (duplicated species
  // rows). Total hours, notes, include_in_report are now the only
  // editable scalars on the entry — license / tag links may also be
  // overridden but those are guarded separately.
  const hoursRaw = String(formData.get('total_hours') ?? '').trim()
  let totalHours: number | null = null
  if (hoursRaw) {
    const n = Number(hoursRaw)
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'Total hours must be a non-negative number.' }
    }
    totalHours = n
  }

  const notes = String(formData.get('notes') ?? '').trim() || null
  const includeInReport = formData.get('include_in_report') === 'on'

  const licenseRaw = String(formData.get('license_wallet_item_id') ?? '').trim()
  const tagRaw = String(formData.get('tag_wallet_item_id') ?? '').trim()

  const update: EntryUpdate = {
    total_hours: totalHours,
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

// ── deleteHarvestLogAction ──────────────────────────────────────────────
// v27.1.1.0.3a.1: lets the guide reset the report and start over. Cascades
// to entries + species; the per-entry tag-consume trigger fires DELETE on
// each entry and un-tags any consumed tags via reference counting.

export type DeleteHarvestLogResult = { ok: true; trip_id: string } | { error: string }

export async function deleteHarvestLogAction(
  logId: string
): Promise<DeleteHarvestLogResult> {
  const { profile } = await requireGuide()
  if (!logId) return { error: 'Missing log id.' }

  const sb = await createClient()

  // Verify ownership + capture trip_id for revalidate + redirect.
  const { data: log } = await sb
    .from('harvest_logs')
    .select('id, trip_id, trips!inner(guide_id)')
    .eq('id', logId)
    .maybeSingle()
  if (!log) return { error: 'Harvest log not found.' }
  const ownerId = (log as unknown as { trips: { guide_id: string } }).trips.guide_id
  if (ownerId !== profile.id) return { error: 'You do not own this trip.' }

  const { error } = await sb.from('harvest_logs').delete().eq('id', logId)
  if (error) {
    console.warn('[harvestLog.delete]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not delete report.' }
  }

  revalidatePath(`/app/trips/${log.trip_id}`)
  revalidatePath(`/app/trips/${log.trip_id}/log`)
  revalidatePath(`/app/h/trips/${log.trip_id}`)
  return { ok: true, trip_id: log.trip_id }
}

// Convenience server action that wraps deleteHarvestLogAction + redirect
// so the client can call a single function and end up back on the trip.
export async function deleteHarvestLogAndRedirectAction(
  logId: string
): Promise<{ error: string } | never> {
  const res = await deleteHarvestLogAction(logId)
  if ('error' in res) return res
  redirect(`/app/trips/${res.trip_id}`)
}

// ── multi-species CRUD ──────────────────────────────────────────────────

export async function addEntrySpeciesAction(
  entryId: string
): Promise<{ ok: true; id: string } | { error: string }> {
  await requireGuide()
  if (!entryId) return { error: 'Missing entry id.' }
  const sb = await createClient()

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

  revalidatePath('/app/trips', 'layout')
  return { ok: true, id: data.id }
}

// v27.1.1.0.3a.2: phantom-row save path. Creates a species row with all
// fields populated in a single call so the editor can promote a
// tag-prefilled phantom into a real row on first Save without a
// two-call dance (insert blank → update). Mirrors updateEntrySpeciesAction's
// validation. Returns the new row id.
export async function createEntrySpeciesAction(
  formData: FormData
): Promise<{ ok: true; id: string } | { error: string }> {
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
  const qRel = num('qty_released')
  if (qHarv === null || qRel === null) {
    return { error: 'Quantities must be non-negative whole numbers.' }
  }
  const species = String(formData.get('species') ?? '').trim() || null

  const sb = await createClient()

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
    .insert({
      entry_id: entryId,
      position: nextPos,
      species,
      qty_harvested: qHarv,
      qty_released: qRel,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[harvestLog.createSpecies]', { code: error?.code, message: error?.message })
    return { error: error?.message || 'Could not save species row.' }
  }

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
  const qRel = num('qty_released')
  if (qHarv === null || qRel === null) {
    return { error: 'Quantities must be non-negative whole numbers.' }
  }
  const species = String(formData.get('species') ?? '').trim() || null

  const sb = await createClient()
  const { error } = await sb
    .from('harvest_log_entry_species')
    .update({ species, qty_harvested: qHarv, qty_released: qRel })
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
