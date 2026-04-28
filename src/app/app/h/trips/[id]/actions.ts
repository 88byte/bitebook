'use server'

import { revalidatePath } from 'next/cache'
import { requireHunter } from '../../../_lib/auth'
import { createClient } from '@/lib/supabase/server'

// v26.0 Batch A: review submission for hunter side. Upsert path: insert when
// no review exists, update when one exists and the 7-day window is open
// (RLS enforces the window via the update policy — server action just
// proxies the result to the client).
export type ReviewActionResult = { ok: true } | { error: string }

export async function submitTripReviewAction(formData: FormData): Promise<ReviewActionResult> {
  const { profile } = await requireHunter()

  const tripId = String(formData.get('trip_id') ?? '').trim()
  const ratingStr = String(formData.get('rating') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim().slice(0, 500) || null

  if (!tripId) return { error: 'Missing trip id.' }
  const rating = Number(ratingStr)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Pick a rating from 1 to 5.' }

  const supabase = await createClient()

  // Look up the trip to verify status + capture guide_id (we trust RLS to
  // ensure this hunter is a participant on the trip; the check here adds a
  // friendlier "not completed" error message rather than a generic RLS
  // rejection at insert time).
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, guide_id, status')
    .eq('id', tripId)
    .maybeSingle()
  if (tripErr) {
    console.warn('[h.trips.submitTripReviewAction:lookup]', { code: tripErr.code, message: tripErr.message })
    return { error: 'Could not verify trip.' }
  }
  if (!trip) return { error: 'Trip not found.' }
  if (trip.status !== 'completed') return { error: 'You can only review completed trips.' }

  const { error } = await supabase
    .from('trip_reviews')
    .upsert(
      {
        trip_id: tripId,
        hunter_id: profile.id,
        guide_id: trip.guide_id,
        rating,
        comment,
      },
      { onConflict: 'trip_id,hunter_id' }
    )
  if (error) {
    console.warn('[h.trips.submitTripReviewAction:upsert]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save review.' }
  }

  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h')
  return { ok: true }
}
