'use server'

import { revalidatePath } from 'next/cache'
import { requireGuide } from '../../_lib/auth'
import { insertTripParticipants } from '../../_lib/queries'
import { createClient } from '@/lib/supabase/server'

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
