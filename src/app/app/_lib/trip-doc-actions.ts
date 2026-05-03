'use server'

// v27.1.3 — Trip-doc attachment + per-hunter actions.
// Guide attaches docs (waivers / resources / Bite Book templates) to a
// trip; per-hunter "sign" or "view" requirements optionally route through
// trip_doc_hunter_actions. Hunter side reads visible docs + their own
// pending actions and marks them complete.

import { revalidatePath } from 'next/cache'
import { requireGuide, requireUser } from './auth'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { ok: true } | { error: string }
export type ActionType = 'sign' | 'view'

function isActionType(s: string | null | undefined): s is ActionType {
  return s === 'sign' || s === 'view'
}

// Verify a doc the guide is trying to attach is one they own OR a
// Bite Book template — and that it isn't a generated-PDF residue.
// Returns the doc row (kind, label) on success.
async function vetAttachableDoc(
  guideId: string,
  docId: string
): Promise<
  | { ok: true; doc: { id: string; kind: string; label: string; is_template: boolean; guide_id: string } }
  | { error: string }
> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('docs')
    .select('id, kind, label, is_template, guide_id, archived_at')
    .eq('id', docId)
    .or(`guide_id.eq.${guideId},is_template.eq.true`)
    .maybeSingle()
  if (error || !data) return { error: 'Doc not found.' }
  if (data.archived_at) return { error: 'Cannot attach an archived doc — restore it first.' }
  // Generated PDFs from before v27.1.1.0.3e.3 lived under file_path
  // logs/...; current generated outputs use trip_generated_logs (not the
  // docs table). Either way, log-kind docs are intentionally excluded
  // from trip attachment — they're outputs, not inputs.
  if (data.kind === 'log') return { error: 'Harvest logs aren\'t attached as trip docs — they\'re generated outputs.' }
  return { ok: true, doc: data as never }
}

export async function attachDocToTripAction(
  tripId: string,
  docId: string,
  hunterVisible: boolean
): Promise<ActionResult & { id?: string }> {
  const { profile } = await requireGuide()
  if (!tripId || !docId) return { error: 'Missing trip or doc id.' }

  const sb = await createClient()
  // Verify guide owns the trip first.
  const { data: trip } = await sb
    .from('trips')
    .select('id, guide_id')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  const vet = await vetAttachableDoc(profile.id, docId)
  if ('error' in vet) return { error: vet.error }

  // No-op + return the existing row id when already attached.
  const { data: existing } = await sb
    .from('trip_docs')
    .select('id')
    .eq('trip_id', tripId)
    .eq('doc_id', docId)
    .maybeSingle()
  if (existing) {
    return { ok: true, id: existing.id }
  }

  const { data: created, error: insErr } = await sb
    .from('trip_docs')
    .insert({
      trip_id: tripId,
      doc_id: docId,
      hunter_visible: hunterVisible,
      created_by: profile.id,
    })
    .select('id')
    .single()
  if (insErr || !created) {
    console.warn('[trip-docs.attach]', { code: insErr?.code, message: insErr?.message })
    return { error: insErr?.message || 'Could not attach doc.' }
  }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  return { ok: true, id: created.id }
}

export async function detachDocFromTripAction(tripDocId: string): Promise<ActionResult> {
  const { profile } = await requireGuide()
  if (!tripDocId) return { error: 'Missing trip-doc id.' }

  const sb = await createClient()
  // Owner-scope check piggybacks on the existing trip_docs RLS guide
  // policy (guide owns trip → can delete the row). The .eq below is
  // defense-in-depth.
  const { data: row } = await sb
    .from('trip_docs')
    .select('id, trip_id, trips!inner(guide_id)')
    .eq('id', tripDocId)
    .maybeSingle()
  type RowWithTrip = { id: string; trip_id: string; trips: { guide_id: string } }
  const r = row as RowWithTrip | null
  if (!r || r.trips?.guide_id !== profile.id) return { error: 'Not allowed.' }

  const { error } = await sb.from('trip_docs').delete().eq('id', tripDocId)
  if (error) return { error: error.message || 'Could not detach doc.' }

  revalidatePath(`/app/trips/${r.trip_id}`)
  revalidatePath(`/app/h/trips/${r.trip_id}`)
  return { ok: true }
}

export async function setTripDocVisibilityAction(
  tripDocId: string,
  hunterVisible: boolean
): Promise<ActionResult> {
  const { profile } = await requireGuide()
  if (!tripDocId) return { error: 'Missing trip-doc id.' }

  const sb = await createClient()
  const { data: row } = await sb
    .from('trip_docs')
    .select('id, trip_id, trips!inner(guide_id)')
    .eq('id', tripDocId)
    .maybeSingle()
  type RowWithTrip = { id: string; trip_id: string; trips: { guide_id: string } }
  const r = row as RowWithTrip | null
  if (!r || r.trips?.guide_id !== profile.id) return { error: 'Not allowed.' }

  const { error } = await sb
    .from('trip_docs')
    .update({ hunter_visible: hunterVisible })
    .eq('id', tripDocId)
  if (error) return { error: error.message || 'Could not update visibility.' }

  revalidatePath(`/app/trips/${r.trip_id}`)
  revalidatePath(`/app/h/trips/${r.trip_id}`)
  return { ok: true }
}

export async function assignHunterActionAction(
  tripDocId: string,
  hunterId: string,
  actionType: ActionType,
  required: boolean
): Promise<ActionResult & { id?: string }> {
  const { profile } = await requireGuide()
  if (!tripDocId || !hunterId) return { error: 'Missing trip-doc or hunter id.' }
  if (!isActionType(actionType)) return { error: 'Invalid action type.' }

  const sb = await createClient()
  // Verify the trip belongs to the guide AND the hunter is on the trip.
  const { data: row } = await sb
    .from('trip_docs')
    .select('id, trip_id, trips!inner(guide_id)')
    .eq('id', tripDocId)
    .maybeSingle()
  type RowWithTrip = { id: string; trip_id: string; trips: { guide_id: string } }
  const r = row as RowWithTrip | null
  if (!r || r.trips?.guide_id !== profile.id) return { error: 'Not allowed.' }

  const { data: part } = await sb
    .from('trip_participants')
    .select('id')
    .eq('trip_id', r.trip_id)
    .eq('hunter_id', hunterId)
    .maybeSingle()
  if (!part) return { error: 'Hunter is not on this trip.' }

  // Upsert by (trip_doc_id, hunter_id) — one active assignment per pair.
  const { data: existing } = await sb
    .from('trip_doc_hunter_actions')
    .select('id')
    .eq('trip_doc_id', tripDocId)
    .eq('hunter_id', hunterId)
    .maybeSingle()
  let id: string
  if (existing) {
    const { error: updErr } = await sb
      .from('trip_doc_hunter_actions')
      .update({ action_type: actionType, required })
      .eq('id', existing.id)
    if (updErr) return { error: updErr.message || 'Could not update action.' }
    id = existing.id
  } else {
    const { data: created, error: insErr } = await sb
      .from('trip_doc_hunter_actions')
      .insert({
        trip_doc_id: tripDocId,
        hunter_id: hunterId,
        action_type: actionType,
        required,
      })
      .select('id')
      .single()
    if (insErr || !created) return { error: insErr?.message || 'Could not assign action.' }
    id = created.id
  }

  revalidatePath(`/app/trips/${r.trip_id}`)
  revalidatePath(`/app/h/trips/${r.trip_id}`)
  revalidatePath('/app/h')
  return { ok: true, id }
}

export async function unassignHunterActionAction(actionId: string): Promise<ActionResult> {
  const { profile } = await requireGuide()
  if (!actionId) return { error: 'Missing action id.' }

  const sb = await createClient()
  // Owner check: action's trip_doc → trip → guide_id must match.
  const { data: row } = await sb
    .from('trip_doc_hunter_actions')
    .select('id, trip_doc_id, trip_docs!inner(trip_id, trips!inner(guide_id))')
    .eq('id', actionId)
    .maybeSingle()
  type ActionRow = {
    id: string
    trip_doc_id: string
    trip_docs: { trip_id: string; trips: { guide_id: string } }
  }
  const r = row as ActionRow | null
  if (!r || r.trip_docs?.trips?.guide_id !== profile.id) return { error: 'Not allowed.' }
  const tripId = r.trip_docs.trip_id

  const { error } = await sb.from('trip_doc_hunter_actions').delete().eq('id', actionId)
  if (error) return { error: error.message || 'Could not remove action.' }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h')
  return { ok: true }
}

// Hunter marks an assigned action complete. RLS on trip_doc_hunter_actions
// already gates UPDATE to hunter_id = auth.uid(), so the action only
// flips for the assigned hunter. completed_data is a free-form jsonb;
// for v27.1.3 'sign' actions, the UI sends { acknowledged_at: ISO } as a
// placeholder until v27.2's e-signature flow lands.
export async function completeHunterActionAction(
  actionId: string,
  completedData?: Record<string, unknown> | null
): Promise<ActionResult> {
  const { user } = await requireUser()
  if (!actionId) return { error: 'Missing action id.' }

  const sb = await createClient()
  // completed_data is jsonb in the schema; cast through unknown so the
  // generated Json union (which doesn't include arbitrary
  // Record<string, unknown>) accepts the placeholder shape.
  const payload =
    completedData && typeof completedData === 'object'
      ? (completedData as unknown)
      : ({ acknowledged_at: new Date().toISOString() } as unknown)

  const { data: row, error } = await sb
    .from('trip_doc_hunter_actions')
    .update({
      completed_at: new Date().toISOString(),
      completed_data: payload as never,
    })
    .eq('id', actionId)
    .eq('hunter_id', user.id)
    .select('id, trip_doc_id, trip_docs!inner(trip_id)')
    .maybeSingle()
  type ActionRow = { id: string; trip_doc_id: string; trip_docs: { trip_id: string } }
  const r = row as ActionRow | null
  if (error || !r) {
    console.warn('[trip-doc-actions.complete]', { code: error?.code, message: error?.message })
    return { error: error?.message || 'Could not mark action complete.' }
  }

  revalidatePath(`/app/h/trips/${r.trip_docs.trip_id}`)
  revalidatePath('/app/h')
  return { ok: true }
}
