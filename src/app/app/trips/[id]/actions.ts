'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../../_lib/auth'
import {
  insertTripParticipants,
  syncTripParticipants,
  updateTrip,
  reopenTrip,
  insertHarvest,
  closeTrip,
} from '../../_lib/queries'
import { createClient } from '@/lib/supabase/server'
import { isValidMethod } from '@/lib/methods'
import type { Database } from '@/lib/supabase/types'

type Kind = Database['public']['Enums']['harvest_kind']

export type AddParticipantsResult = { ok: true } | { error: string }

// v25.4: add accepted hunters to an existing trip from the trip detail page.
// Reuses the insertTripParticipants helper which already verifies trip
// ownership before inserting children. We additionally short-circuit on a
// missing/closed trip so the UI gets a clear error string.
export async function addTripParticipantsAction(
  formData: FormData
): Promise<AddParticipantsResult> {
  const { profile } = await requireGuide()

  const tripId = String(formData.get('trip_id') ?? '').trim()
  const hunterIds = formData
    .getAll('hunter_ids')
    .map((v) => String(v))
    .filter(Boolean)

  if (!tripId) return { error: 'Missing trip id.' }
  if (hunterIds.length === 0) return { error: 'Pick at least one hunter to add.' }

  // Verify trip belongs to caller and is in a state that accepts new
  // participants. RLS gates ownership too — this is defense-in-depth + lets
  // us return a friendly message rather than a generic insert failure.
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

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  return { ok: true }
}

// v26.3: full trip update from /app/trips/[id]/edit. Mirrors createTripAction
// validation but writes to an existing row + syncs the participant set.
export async function updateTripAction(formData: FormData) {
  const { profile } = await requireGuide()

  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) throw new Error('Missing trip id.')

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

  if (!title) throw new Error('Trip title is required.')
  if (!startsAt) throw new Error('Trip start date is required.')
  if (kind !== 'hunting' && kind !== 'fishing') throw new Error('Invalid trip kind.')
  if (!stateRaw || stateRaw.length !== 2) throw new Error('State is required.')

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
  if ('error' in result) throw new Error(result.error)

  const syncResult = await syncTripParticipants(profile.id, tripId, hunterIds)
  if ('error' in syncResult) {
    // Trip update committed; surface the partial state but still complete.
    console.warn('[updateTripAction] participant sync failed', syncResult.error)
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  redirect(`/app/trips/${tripId}`)
}

export type ReopenTripResult = { ok: true } | { error: string }

// v26.3: flip a completed/canceled trip back to active so the guide can edit
// details + add harvests again.
export async function reopenTripAction(formData: FormData): Promise<ReopenTripResult> {
  const { profile } = await requireGuide()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const result = await reopenTrip(profile.id, tripId)
  if ('error' in result) return { error: result.error }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  return { ok: true }
}

export type WrapUpTripResult = { ok: true } | { error: string }

// v26.3: rename of closeTripAction in the UI. The DB-level helper is still
// closeTrip(); same semantics — set status='completed'. Returns a result
// object instead of throwing so the UI can show a confirm modal + show
// errors inline rather than dumping a Next error overlay.
export async function wrapUpTripAction(formData: FormData): Promise<WrapUpTripResult> {
  const { profile } = await requireGuide()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const result = await closeTrip(profile.id, tripId)
  if ('error' in result) return { error: result.error }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  return { ok: true }
}

export type AddHarvestResult = { ok: true; id: string } | { error: string }

// v26.3: create a harvest row from the AddHarvestForm on the trip detail.
// Self-cert checkbox is required client-side AND server-side (rejected if
// the consent flag is missing — guide attests they witnessed the harvest).
export async function addHarvestAction(formData: FormData): Promise<AddHarvestResult> {
  const { profile } = await requireGuide()

  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }

  const hunterId = String(formData.get('hunter_id') ?? '').trim() || null
  const consumedWalletItemId = String(formData.get('consumed_wallet_item_id') ?? '').trim() || null
  const speciesName = String(formData.get('species_name') ?? '').trim()
  const kindRaw = String(formData.get('kind') ?? '').trim() as Kind
  const tagNumber = String(formData.get('tag_number') ?? '').trim()
  const methodRaw = String(formData.get('method') ?? '').trim()
  const quantityRaw = String(formData.get('quantity') ?? '1').trim()
  const harvestedAtRaw = String(formData.get('harvested_at') ?? '').trim()
  const notesInput = String(formData.get('notes') ?? '').trim()
  const selfCert = formData.get('self_cert') === 'on'

  if (!hunterId) return { error: 'Pick a hunter for this harvest.' }
  if (!speciesName) return { error: 'Enter a species.' }
  if (kindRaw !== 'hunting' && kindRaw !== 'fishing') return { error: 'Invalid kind.' }
  if (!selfCert) return { error: 'Confirm you witnessed this harvest before saving.' }

  const quantity = Math.max(1, Math.min(99, Number.parseInt(quantityRaw, 10) || 1))
  const method = methodRaw && isValidMethod(methodRaw) ? methodRaw : null
  const harvestedAt = harvestedAtRaw
    ? new Date(harvestedAtRaw).toISOString()
    : new Date().toISOString()

  const result = await insertHarvest(profile.id, {
    trip_id: tripId,
    hunter_id: hunterId,
    kind: kindRaw,
    species_name: speciesName,
    method,
    quantity,
    tag_number: tagNumber || null,
    harvested_at: harvestedAt,
    notes: notesInput || null,
    consumed_wallet_item_id: consumedWalletItemId,
  })
  if ('error' in result) return { error: result.error }

  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  revalidatePath('/app')
  // v27.0b.4.2: also bust the hunter-side trip detail + dashboard so a
  // hunter looking at /app/h/trips/[id] sees the harvest the guide just
  // logged on next page load. (Pages are dynamic via cookies-using
  // Supabase auth, so this is belt-and-suspenders for the data cache.)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true, id: result.id }
}

// v27.0b.3: edit a harvest. Reads the existing row first so we know the
// previous consumed_wallet_item_id, then updates the row in place. The
// `_on_harvest_consume_tag` trigger handles flipping the NEW tag to
// tagged_out_at on UPDATE OF consumed_wallet_item_id. Un-flipping the
// OLD tag is server-side here: only clear `tagged_out_at` when no other
// harvest still references it.
export type UpdateHarvestResult = { ok: true; id: string } | { error: string }

export async function updateHarvestAction(formData: FormData): Promise<UpdateHarvestResult> {
  const { profile } = await requireGuide()

  const harvestId = String(formData.get('harvest_id') ?? '').trim()
  if (!harvestId) return { error: 'Missing harvest id.' }

  const sb = await createClient()

  // 1. Load the existing harvest row + verify guide owns the trip.
  const { data: existing, error: readErr } = await sb
    .from('harvests')
    .select('id, trip_id, consumed_wallet_item_id, trips!inner(guide_id, status)')
    .eq('id', harvestId)
    .maybeSingle()
  if (readErr || !existing) return { error: 'Harvest not found.' }
  const trip = (existing as unknown as { trips: { guide_id: string; status: string } }).trips
  if (trip.guide_id !== profile.id) return { error: 'You do not own this trip.' }
  if (trip.status !== 'planned' && trip.status !== 'active') {
    return { error: 'This trip is closed; reopen it before editing harvests.' }
  }

  // 2. Parse new field values.
  const speciesName = String(formData.get('species_name') ?? '').trim()
  const kindRaw = String(formData.get('kind') ?? '').trim() as Kind
  const tagNumber = String(formData.get('tag_number') ?? '').trim()
  const methodRaw = String(formData.get('method') ?? '').trim()
  const quantityRaw = String(formData.get('quantity') ?? '1').trim()
  const harvestedAtRaw = String(formData.get('harvested_at') ?? '').trim()
  const notesInput = String(formData.get('notes') ?? '').trim()
  const hunterId = String(formData.get('hunter_id') ?? '').trim() || null
  const newConsumedRaw = String(formData.get('consumed_wallet_item_id') ?? '').trim()
  const newConsumed = newConsumedRaw || null

  if (!hunterId) return { error: 'Pick a hunter for this harvest.' }
  if (!speciesName) return { error: 'Enter a species.' }
  if (kindRaw !== 'hunting' && kindRaw !== 'fishing') return { error: 'Invalid kind.' }

  const quantity = Math.max(1, Math.min(99, Number.parseInt(quantityRaw, 10) || 1))
  const method = methodRaw && isValidMethod(methodRaw) ? methodRaw : null
  const harvestedAt = harvestedAtRaw
    ? new Date(harvestedAtRaw).toISOString()
    : new Date().toISOString()

  // 3. Update the row. Trigger fires AFTER UPDATE OF consumed_wallet_item_id
  //    and stamps tagged_out_at on the new tag if non-null.
  const { error: updErr } = await sb
    .from('harvests')
    .update({
      hunter_id: hunterId,
      kind: kindRaw,
      species_name: speciesName,
      method,
      quantity,
      tag_number: tagNumber || null,
      harvested_at: harvestedAt,
      notes: notesInput || null,
      consumed_wallet_item_id: newConsumed,
    })
    .eq('id', harvestId)
  if (updErr) {
    console.warn('[updateHarvestAction]', { code: updErr.code, message: updErr.message })
    return { error: updErr.message || 'Could not update harvest.' }
  }

  // 4. Un-flip the old tag if (a) it changed, (b) was non-null, (c) no
  //    other harvest still references it.
  const oldConsumed = existing.consumed_wallet_item_id
  if (oldConsumed && oldConsumed !== newConsumed) {
    const { count } = await sb
      .from('harvests')
      .select('id', { count: 'exact', head: true })
      .eq('consumed_wallet_item_id', oldConsumed)
    if (!count || count === 0) {
      await sb
        .from('wallet_items')
        .update({ tagged_out_at: null })
        .eq('id', oldConsumed)
    }
  }

  revalidatePath(`/app/trips/${existing.trip_id}`)
  revalidatePath('/app/trips')
  revalidatePath('/app')
  // v27.0b.4.2: hunter-side paths also busted so guide edits to method,
  // hunter, time, species, tag # all show on /app/h/trips/[id] next load.
  revalidatePath(`/app/h/trips/${existing.trip_id}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true, id: harvestId }
}

// v27.0b.3: delete a harvest. Same un-flip-old-tag logic — clear the
// tagged_out_at on the consumed wallet item only if no other harvest
// references it.
export type DeleteHarvestResult = { ok: true } | { error: string }

export async function deleteHarvestAction(harvestId: string): Promise<DeleteHarvestResult> {
  const { profile } = await requireGuide()
  if (!harvestId) return { error: 'Missing harvest id.' }

  const sb = await createClient()
  const { data: existing, error: readErr } = await sb
    .from('harvests')
    .select('id, trip_id, consumed_wallet_item_id, trips!inner(guide_id, status)')
    .eq('id', harvestId)
    .maybeSingle()
  if (readErr || !existing) return { error: 'Harvest not found.' }
  const trip = (existing as unknown as { trips: { guide_id: string; status: string } }).trips
  if (trip.guide_id !== profile.id) return { error: 'You do not own this trip.' }
  if (trip.status !== 'planned' && trip.status !== 'active') {
    return { error: 'This trip is closed; reopen it before deleting harvests.' }
  }

  const oldConsumed = existing.consumed_wallet_item_id

  const { error: delErr } = await sb.from('harvests').delete().eq('id', harvestId)
  if (delErr) {
    console.warn('[deleteHarvestAction]', { code: delErr.code, message: delErr.message })
    return { error: delErr.message || 'Could not delete harvest.' }
  }

  if (oldConsumed) {
    const { count } = await sb
      .from('harvests')
      .select('id', { count: 'exact', head: true })
      .eq('consumed_wallet_item_id', oldConsumed)
    if (!count || count === 0) {
      await sb
        .from('wallet_items')
        .update({ tagged_out_at: null })
        .eq('id', oldConsumed)
    }
  }

  revalidatePath(`/app/trips/${existing.trip_id}`)
  revalidatePath('/app/trips')
  revalidatePath('/app')
  // v27.0b.4.2: hunter-side paths.
  revalidatePath(`/app/h/trips/${existing.trip_id}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}
