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
  return { ok: true, id: result.id }
}
