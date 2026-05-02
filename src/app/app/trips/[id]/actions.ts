'use server'

// v27.1.1.0.3a — harvest actions removed. The harvest_logs / harvest_log_entries
// pivot replaces row-by-row harvest logging; entry CRUD lives in
// src/app/app/_lib/harvest-log-actions.ts. This file keeps only the
// trip-level lifecycle actions (participants, edit, reopen, cancel, wrap up).

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../../_lib/auth'
import {
  insertTripParticipants,
  syncTripParticipants,
  updateTrip,
  reopenTrip,
  closeTrip,
} from '../../_lib/queries'
import { createClient } from '@/lib/supabase/server'
import { isValidMethod } from '@/lib/methods'
import type { Database } from '@/lib/supabase/types'

type Kind = Database['public']['Enums']['harvest_kind']

export type AddParticipantsResult = { ok: true } | { error: string }

// v25.4: add accepted hunters to an existing trip from the trip detail page.
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
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  return { ok: true }
}

// v26.3: full trip update from /app/trips/[id]/edit.
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
    console.warn('[updateTripAction] participant sync failed', syncResult.error)
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  redirect(`/app/trips/${tripId}`)
}

export type ReopenTripResult = { ok: true } | { error: string }

export async function reopenTripAction(formData: FormData): Promise<ReopenTripResult> {
  const { profile } = await requireGuide()
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
