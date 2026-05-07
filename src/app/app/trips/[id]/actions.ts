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
