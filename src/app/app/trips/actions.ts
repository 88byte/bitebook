'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../_lib/auth'
import { insertTrip, insertTripParticipants, closeTrip } from '../_lib/queries'
import { markStepDone } from '../_lib/onboarding'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { isValidMethod } from '@/lib/methods'

type Kind = Database['public']['Enums']['harvest_kind']

// All writes route through helpers in queries.ts. Each takes the verified
// guideId from requireGuide(); RLS gates ownership on the DB side, with
// .eq('guide_id', guideId) as defense-in-depth.
export async function createTripAction(formData: FormData) {
  const { user, profile } = await requireGuide()

  const title = String(formData.get('title') ?? '').trim()
  const kind = (String(formData.get('kind') ?? 'hunting').trim() as Kind)
  const startsAt = String(formData.get('starts_at') ?? '').trim()
  const endsAt = String(formData.get('ends_at') ?? '').trim()
  // v25.9.1: split location fields. state is required (NOT NULL on trips).
  const city = String(formData.get('city') ?? '').trim()
  const stateRaw = String(formData.get('state') ?? '').trim().toUpperCase()
  const zone = String(formData.get('zone') ?? '').trim()
  const county = String(formData.get('county') ?? '').trim()
  // v26.3: species_targeted + method are first-class columns now. Drop the
  // notes-folding hack from v25.9.1 (the migration backfilled existing rows).
  const speciesTargeted = String(formData.get('species_targeted') ?? '').trim()
  const methodRaw = String(formData.get('method') ?? '').trim()
  const notesInput = String(formData.get('notes') ?? '').trim()
  const hunterIds = formData.getAll('hunter_ids').map((v) => String(v)).filter(Boolean)

  if (!title) throw new Error('Trip title is required.')
  if (!startsAt) throw new Error('Trip start date is required.')
  if (kind !== 'hunting' && kind !== 'fishing') throw new Error('Invalid trip kind.')
  if (!stateRaw || stateRaw.length !== 2) throw new Error('State is required.')

  const method = methodRaw && isValidMethod(methodRaw) ? methodRaw : null
  const notes = notesInput || null

  const insertResult = await insertTrip(profile.id, {
    title,
    kind,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    location_name: null,
    city: city || null,
    state: stateRaw,
    zone: zone || null,
    county: county || null,
    species_targeted: speciesTargeted || null,
    method,
    notes,
  })
  if ('error' in insertResult) throw new Error(insertResult.error)

  if (hunterIds.length > 0) {
    const partResult = await insertTripParticipants(profile.id, insertResult.id, hunterIds)
    if ('error' in partResult) {
      // Trip itself is committed; surface the partial-success state instead of
      // rolling back. The detail screen can show "no participants yet" and the
      // guide can re-add from there.
      console.warn('[createTripAction] participants insert failed', partResult.error)
    }
  }

  // v24: mark first_trip onboarding step done. Best-effort; failure does not
  // block the redirect since the trip itself is already saved.
  try {
    const sb = await createClient()
    await markStepDone(sb, user.id, 'first_trip')
  } catch (e) {
    console.warn('[createTripAction] onboarding mark failed', e)
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  // v27.0b.4.3: hunter-side dashboard + trips list bust so participating
  // hunters see the new trip on next load without a hard refresh.
  revalidatePath('/app/h')
  revalidatePath('/app/h/trips')
  redirect(`/app/trips/${insertResult.id}`)
}

export async function closeTripAction(formData: FormData) {
  const { profile } = await requireGuide()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) throw new Error('Missing trip id.')

  const result = await closeTrip(profile.id, tripId)
  if ('error' in result) throw new Error(result.error)

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  // v27.0b.4.3: hunter-side cache bust on trip close so wrapped-trip
  // status + review CTA appears on /app/h/trips/[id].
  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
}
