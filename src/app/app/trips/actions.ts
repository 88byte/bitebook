'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../_lib/auth'
import { insertTrip, insertTripParticipants, closeTrip } from '../_lib/queries'
import type { Database } from '@/lib/supabase/types'

type Kind = Database['public']['Enums']['harvest_kind']

// All writes route through helpers in queries.ts. Each takes the verified
// guideId from requireGuide(); RLS gates ownership on the DB side, with
// .eq('guide_id', guideId) as defense-in-depth.
export async function createTripAction(formData: FormData) {
  const { profile } = await requireGuide()

  const title = String(formData.get('title') ?? '').trim()
  const kind = (String(formData.get('kind') ?? 'hunting').trim() as Kind)
  const startsAt = String(formData.get('starts_at') ?? '').trim()
  const endsAt = String(formData.get('ends_at') ?? '').trim()
  const locationName = String(formData.get('location_name') ?? '').trim()
  const speciesTargeted = String(formData.get('species_targeted') ?? '').trim()
  const notesInput = String(formData.get('notes') ?? '').trim()
  const hunterIds = formData.getAll('hunter_ids').map((v) => String(v)).filter(Boolean)

  if (!title) throw new Error('Trip title is required.')
  if (!startsAt) throw new Error('Trip start date is required.')
  if (kind !== 'hunting' && kind !== 'fishing') throw new Error('Invalid trip kind.')

  // Schema doesn't have a species_targeted column yet; fold it into notes so
  // the value isn't lost. When that migration lands we can split it out.
  const notes = [
    speciesTargeted ? `Species targeted: ${speciesTargeted}` : '',
    notesInput,
  ].filter(Boolean).join('\n\n') || null

  const insertResult = await insertTrip(profile.id, {
    title,
    kind,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    location_name: locationName || null,
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

  revalidatePath('/app')
  revalidatePath('/app/trips')
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
}
