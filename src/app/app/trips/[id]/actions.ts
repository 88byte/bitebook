'use server'

// v27.1.1.0.3a — harvest actions removed. The harvest_logs / harvest_log_entries
// pivot replaces row-by-row harvest logging; entry CRUD lives in
// src/app/app/_lib/harvest-log-actions.ts. This file keeps only the
// trip-level lifecycle actions (participants, edit, reopen, cancel, wrap up).

import { revalidatePath } from 'next/cache'
import { requireGuide } from '../../_lib/auth'
import { assertWriteAllowed } from '../../_lib/billing-tier'
import {
  insertTripParticipants,
  syncTripParticipants,
  updateTrip,
  reopenTrip,
  closeTrip,
} from '../../_lib/queries'
import { ensureHarvestLog } from '../../_lib/harvest-log-queries'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidMethod } from '@/lib/methods'
import type { Database } from '@/lib/supabase/types'

type Kind = Database['public']['Enums']['harvest_kind']

export type AddParticipantsResult = { ok: true } | { error: string }

// v27.3.8.1 item 1 — auto-save participant sync from the combined
// "Hunters on this trip" panel. Replaces the deleted TripDetailEditor
// Hunters accordion's full-trip-update path; this action only touches
// trip_participants (and ensures the harvest log) without requiring
// the rest of the trip's required fields in the form data.
export async function syncTripParticipantsAction(
  tripId: string,
  hunterIds: string[]
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  if (!tripId) return { error: 'Missing trip id.' }

  const sb = await createClient()
  const { data: trip } = await sb
    .from('trips')
    .select('id, status, guide_id')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }
  if (trip.status !== 'planned' && trip.status !== 'active') {
    return { error: 'This trip is closed; the hunter list is locked.' }
  }

  const cleaned = hunterIds.filter((id) => id && !id.startsWith('pending:'))
  const result = await syncTripParticipants(profile.id, tripId, cleaned)
  if ('error' in result) return { error: result.error }

  try {
    await ensureHarvestLog(tripId, profile.id)
  } catch (e) {
    console.warn('[syncTripParticipants:ensureHarvestLog]', e)
  }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

// v25.4: add accepted hunters to an existing trip from the trip detail page.
export async function addTripParticipantsAction(
  formData: FormData
): Promise<AddParticipantsResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }

  const tripId = String(formData.get('trip_id') ?? '').trim()
  const hunterIds = formData
    .getAll('hunter_ids')
    .map((v) => String(v))
    .filter(Boolean)

  if (!tripId) return { error: 'Missing trip id.' }
  if (hunterIds.length === 0) return { error: 'Pick at least one hunter to add.' }

  const supabase = await createClient()
  const { data: trip } = await supabase
    .from('trips')
    .select('id, status')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }
  if (trip.status !== 'planned' && trip.status !== 'active') {
    return { error: 'This trip is closed; no new hunters can be added.' }
  }

  const result = await insertTripParticipants(profile.id, tripId, hunterIds)
  if ('error' in result) return { error: result.error }

  // v27.1.3.0.3: auto-create the harvest log on first hunter join. The
  // helper is idempotent — if the log already exists it returns the
  // existing row id and inserts no new entries. Best-effort: if it fails
  // we don't block the participant add (guide can still tap Generate
  // hunt report from the action row).
  try {
    await ensureHarvestLog(tripId, profile.id)
  } catch (e) {
    console.warn('[addTripParticipants:ensureHarvestLog]', e)
  }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

// v26.3: full trip update from /app/trips/[id]/edit.
// v27.1.1.0.3e.6: returns a result and skips the redirect — auto-save on
// blur from the new inline TripDetailEditor on /app/trips/[id] needs to
// stay on the page. Validation errors are surfaced to the caller instead
// of thrown so each input can show a per-field saved/error pill.
export type UpdateTripResult = { ok: true } | { error: string }

export async function updateTripAction(formData: FormData): Promise<UpdateTripResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }

  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const title = String(formData.get('title') ?? '').trim()
  const kind = String(formData.get('kind') ?? 'hunting').trim() as Kind
  const startsAt = String(formData.get('starts_at') ?? '').trim()
  const endsAt = String(formData.get('ends_at') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const stateRaw = String(formData.get('state') ?? '').trim().toUpperCase()
  const zone = String(formData.get('zone') ?? '').trim()
  const county = String(formData.get('county') ?? '').trim()
  const speciesTargeted = String(formData.get('species_targeted') ?? '').trim()
  const methodRaw = String(formData.get('method') ?? '').trim()
  const notesInput = String(formData.get('notes') ?? '').trim()
  const hunterIds = formData.getAll('hunter_ids').map((v) => String(v)).filter(Boolean)
  // v27.1.1.0.3e.6: opt-in flag. When the editor is auto-saving a single
  // section (e.g. just the Notes field), it still sends the full FormData
  // for safety, but it sets sync_participants=0 to skip the participant
  // diff (otherwise a Notes blur would wipe the participant list because
  // the inline editor doesn't carry hunter_ids in every save).
  const syncParticipants = String(formData.get('sync_participants') ?? '1').trim() !== '0'

  if (!title) return { error: 'Trip title is required.' }
  if (!startsAt) return { error: 'Trip start date is required.' }
  if (kind !== 'hunting' && kind !== 'fishing') return { error: 'Invalid trip kind.' }
  if (!stateRaw || stateRaw.length !== 2) return { error: 'State is required.' }

  const method = methodRaw && isValidMethod(methodRaw) ? methodRaw : null

  const result = await updateTrip(profile.id, tripId, {
    title,
    kind,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    city: city || null,
    state: stateRaw,
    zone: zone || null,
    county: county || null,
    species_targeted: speciesTargeted || null,
    method,
    notes: notesInput || null,
  })
  if ('error' in result) return { error: result.error }

  if (syncParticipants) {
    const syncResult = await syncTripParticipants(profile.id, tripId, hunterIds)
    if ('error' in syncResult) {
      console.warn('[updateTripAction] participant sync failed', syncResult.error)
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

export type ReopenTripResult = { ok: true } | { error: string }

export async function reopenTripAction(formData: FormData): Promise<ReopenTripResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const result = await reopenTrip(profile.id, tripId)
  if ('error' in result) return { error: result.error }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

export type CancelTripResult = { ok: true } | { error: string }

export async function cancelTripAction(formData: FormData): Promise<CancelTripResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const sb = await createClient()
  const { error } = await sb
    .from('trips')
    .update({ status: 'canceled' })
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .in('status', ['planned', 'active'])
  if (error) {
    console.warn('[cancelTripAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not cancel trip.' }
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

export type WrapUpTripResult = { ok: true } | { error: string }

export async function wrapUpTripAction(formData: FormData): Promise<WrapUpTripResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const result = await closeTrip(profile.id, tripId)
  if ('error' in result) return { error: result.error }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

export type DeleteTripResult = { ok: true } | { error: string }

// v27.9.3 — permanent trip delete. Distinct from cancel/wrap-up: this
// removes the trip row entirely and lets FK CASCADE clean up every
// child table. FK audit (v27.9.3 sql/check):
//   harvest_logs              CASCADE → cascades harvest_log_entries +
//                                       _user_inputs +
//                                       _entry_species + _entry_user_inputs
//   invitations               CASCADE (v27.9.1 added trip_id col)
//   media                     CASCADE
//   trip_docs                 CASCADE → cascades doc_signatures +
//                                       trip_doc_hunter_actions
//   trip_generated_logs       CASCADE — but storage files in bb-private
//                             still need explicit removal (best-effort
//                             via the loop below; failures don't block
//                             the row delete since the user wants the
//                             trip gone regardless).
//   trip_participants         CASCADE
//   trip_reviews              CASCADE
//   trip_wallet_items         CASCADE — note: only the LINK rows go;
//                             the underlying wallet_items (license/tag)
//                             stay in the hunter's wallet.
// Migration NOT needed — every trip-keyed FK was already CASCADE.
//
// Safety:
//   1. requireGuide gate
//   2. Caller must own the trip (eq guide_id)
//   3. confirmTitle must match trips.title (case-insensitive trim) —
//      defense in depth alongside the type-to-confirm modal.
export async function deleteTripAction(formData: FormData): Promise<DeleteTripResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const tripId = String(formData.get('trip_id') ?? '').trim()
  const confirmTitle = String(formData.get('confirm_title') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }
  if (!confirmTitle) return { error: 'Type the trip title to confirm.' }

  const sb = await createClient()

  // Read the trip first — verifies ownership AND gives us the canonical
  // title for the case-insensitive match. Also captures the file paths
  // we need to remove from storage post-delete.
  const { data: trip, error: readErr } = await sb
    .from('trips')
    .select('id, title')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (readErr) {
    console.warn('[deleteTripAction:read]', { code: readErr.code, message: readErr.message })
    return { error: readErr.message || 'Could not load trip.' }
  }
  if (!trip) return { error: 'Trip not found.' }

  // Case-insensitive trimmed match.
  if (trip.title.trim().toLowerCase() !== confirmTitle.toLowerCase()) {
    return { error: `Title doesn't match. Type "${trip.title}" exactly.` }
  }

  // Pull generated-log file paths BEFORE the delete cascade so we can
  // clean them out of bb-private after. Best-effort: if this read
  // fails, we still proceed with the row delete.
  let filePaths: string[] = []
  try {
    const { data: logs } = await sb
      .from('trip_generated_logs')
      .select('file_path')
      .eq('trip_id', tripId)
    filePaths = (logs ?? []).map((l) => l.file_path).filter(Boolean)
  } catch (e) {
    console.warn('[deleteTripAction:logsRead]', { error: (e as Error).message })
  }

  // Delete the trip row. RLS gates by guide_id; eq() is defense-in-depth.
  // FK CASCADE on every trip-keyed table cleans the rest.
  const { error: delErr } = await sb
    .from('trips')
    .delete()
    .eq('id', tripId)
    .eq('guide_id', profile.id)
  if (delErr) {
    console.warn('[deleteTripAction:delete]', { code: delErr.code, message: delErr.message })
    return { error: delErr.message || 'Could not delete trip.' }
  }

  // Storage cleanup — runs AFTER row delete so a failure here can't
  // strand orphan rows pointing at deleted files. Use the service-role
  // admin client because storage RLS may be scoped per-user and the
  // file paths come from rows that are now deleted (so per-user
  // ownership is no longer derivable). Best-effort.
  if (filePaths.length > 0) {
    try {
      const admin = createAdminClient()
      await admin.storage.from('bb-private').remove(filePaths)
    } catch (e) {
      console.warn('[deleteTripAction:storage]', { count: filePaths.length, error: (e as Error).message })
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

// v27.9.4 — bulk delete trips from /app/trips. Same cascade and
// storage-cleanup semantics as deleteTripAction above; differences:
//   • Bulk-friendly type-to-confirm: caller types "delete" (lowercase
//     trim) instead of each individual trip title — many titles to
//     match would defeat the purpose of bulk.
//   • Per-trip success/failure tracking: a single trip failing (e.g.
//     a Stripe edge case, RLS hiccup) doesn't abort the rest. Returns
//     deletedCount + failedIds so the UI can surface partial success.
//   • Storage cleanup runs once after all rows delete, batched.
//
// Standing safety: requireGuide gate + per-trip ownership re-verify
// (eq guide_id) so a malicious caller can't pass tripIds for trips
// they don't own.
export type BulkDeleteTripsResult =
  | { ok: true; deletedCount: number; failedIds: string[] }
  | { error: string }

export async function bulkDeleteTripsAction(
  tripIds: string[],
  confirmText: string,
): Promise<BulkDeleteTripsResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  if (!Array.isArray(tripIds) || tripIds.length === 0) {
    return { error: 'No trips selected.' }
  }
  if (confirmText.trim().toLowerCase() !== 'delete') {
    return { error: 'Type "delete" to confirm.' }
  }
  // Defense-in-depth cap. The UI doesn't surface 100+ at once but a
  // direct action call could; this prevents a runaway loop.
  if (tripIds.length > 100) {
    return { error: 'Select up to 100 trips at a time.' }
  }

  const sb = await createClient()

  // Single round-trip to fetch every owned trip in the request,
  // pulling generated-log file paths via a join. Anything not in the
  // returned set is either not-owned or already-deleted — flagged as
  // failed.
  const { data: ownedTrips, error: readErr } = await sb
    .from('trips')
    .select('id, trip_generated_logs(file_path)')
    .in('id', tripIds)
    .eq('guide_id', profile.id)
  if (readErr) {
    console.warn('[bulkDeleteTrips:read]', { code: readErr.code, message: readErr.message })
    return { error: readErr.message || 'Could not load trips.' }
  }

  const ownedIds = new Set((ownedTrips ?? []).map((t) => t.id))
  const failedIds: string[] = tripIds.filter((id) => !ownedIds.has(id))

  // Collect file paths across ALL trips in this batch for one storage
  // cleanup pass after the row deletes.
  const allFilePaths: string[] = []
  for (const t of ownedTrips ?? []) {
    const paths = (t as { trip_generated_logs?: { file_path: string | null }[] }).trip_generated_logs ?? []
    for (const p of paths) {
      if (p.file_path) allFilePaths.push(p.file_path)
    }
  }

  // Delete trips in one query — FK CASCADE handles all child tables.
  // Per-trip failures here aren't really possible (it's a single SQL
  // statement), but we capture which IDs the DB confirmed deleted via
  // .select() so we can surface accurate counts.
  const ownedIdList = Array.from(ownedIds)
  let deletedIds: string[] = []
  if (ownedIdList.length > 0) {
    const { data: deletedRows, error: delErr } = await sb
      .from('trips')
      .delete()
      .in('id', ownedIdList)
      .eq('guide_id', profile.id)
      .select('id')
    if (delErr) {
      console.warn('[bulkDeleteTrips:delete]', { code: delErr.code, message: delErr.message })
      return { error: delErr.message || 'Could not delete trips.' }
    }
    deletedIds = (deletedRows ?? []).map((r) => r.id)
    // Any owned id that didn't come back from the delete is a failure.
    for (const id of ownedIdList) {
      if (!deletedIds.includes(id)) failedIds.push(id)
    }
  }

  // Storage cleanup — best-effort, batched.
  if (allFilePaths.length > 0) {
    try {
      const admin = createAdminClient()
      await admin.storage.from('bb-private').remove(allFilePaths)
    } catch (e) {
      console.warn('[bulkDeleteTrips:storage]', { count: allFilePaths.length, error: (e as Error).message })
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true, deletedCount: deletedIds.length, failedIds }
}
