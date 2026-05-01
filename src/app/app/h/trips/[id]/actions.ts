'use server'

import { revalidatePath } from 'next/cache'
import { requireHunter } from '../../../_lib/auth'
import { createClient } from '@/lib/supabase/server'

// v26.0 Batch A: review submission for hunter side. Upsert path: insert
// when no review exists, update when one exists and the 7-day window is
// open (RLS enforces the window via the update policy — server action
// just proxies the result to the client).
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

// v27.0b.6 (B): hunter links one of their own wallet items (license or
// tag) to a trip they're a participant of. Inserts a trip_wallet_items
// row tagged with the hunter's id. RLS gates: hunter must be a
// trip_participant + must own the wallet_item.
export type LinkWalletResult = { ok: true } | { error: string }

export async function linkWalletItemToTripAction(
  formData: FormData
): Promise<LinkWalletResult> {
  const { profile } = await requireHunter()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  const walletItemId = String(formData.get('wallet_item_id') ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }
  if (!walletItemId) return { error: 'Pick a wallet item to link.' }

  const sb = await createClient()

  const { data: participant } = await sb
    .from('trip_participants')
    .select('id')
    .eq('trip_id', tripId)
    .eq('hunter_id', profile.id)
    .maybeSingle()
  if (!participant) return { error: 'You are not a participant on this trip.' }

  const { data: walletItem } = await sb
    .from('wallet_items')
    .select('id, type')
    .eq('id', walletItemId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (!walletItem) return { error: 'Wallet item not found.' }

  const { error } = await sb
    .from('trip_wallet_items')
    .upsert(
      { trip_id: tripId, hunter_id: profile.id, wallet_item_id: walletItemId },
      { onConflict: 'trip_id,hunter_id,wallet_item_id', ignoreDuplicates: true }
    )
  if (error) {
    console.warn('[linkWalletItemToTripAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not link wallet item.' }
  }

  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  revalidatePath('/app')
  return { ok: true }
}
