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
  // v28.0.0: outfitter-owned trips have guide_id null. Reviews of those
  // need to target the outfitter org (review_type='outfitter') —
  // implementation in Sprint 3.6. For now, reject the review submit
  // with a clear error rather than crash on the FK constraint.
  if (!trip.guide_id) {
    return { error: 'Outfitter-trip review submission lands in Sprint 3.6.' }
  }

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

// v27.0b.9: hunter swaps an already-linked trip_wallet_items row to a
// different wallet item of the same type. Lets them fix a mis-pick
// without going through the wallet/trip edit flows.
//
// Edge case (tags only): if the OLD tag has a harvest referencing it
// (harvests.consumed_wallet_item_id = old_id), block the swap with an
// error directing the guide to edit the harvest. Updating the harvest's
// consumed_wallet_item_id silently would mask audit trail and confuse
// the guide who logged it. Guide-side EditHarvestForm already handles
// rebinding, so the path exists.
export type SwapWalletResult = { ok: true } | { error: string }

export async function swapTripWalletItemAction(
  formData: FormData
): Promise<SwapWalletResult> {
  const { profile } = await requireHunter()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  const oldWalletItemId = String(formData.get('old_wallet_item_id') ?? '').trim()
  const newWalletItemId = String(formData.get('new_wallet_item_id') ?? '').trim()

  if (!tripId) return { error: 'Missing trip id.' }
  if (!oldWalletItemId) return { error: 'Missing current link.' }
  if (!newWalletItemId) return { error: 'Pick a wallet item to swap to.' }
  if (oldWalletItemId === newWalletItemId) return { error: 'Same wallet item — no change.' }

  const sb = await createClient()

  // Verify hunter is a participant on the trip.
  const { data: participant } = await sb
    .from('trip_participants')
    .select('id')
    .eq('trip_id', tripId)
    .eq('hunter_id', profile.id)
    .maybeSingle()
  if (!participant) return { error: 'You are not a participant on this trip.' }

  // Verify hunter owns the new wallet item.
  const { data: newItem } = await sb
    .from('wallet_items')
    .select('id, type')
    .eq('id', newWalletItemId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (!newItem) return { error: 'New wallet item not found.' }

  // Verify hunter owned (now or originally) the old wallet item — required
  // because RLS gates the trip_wallet_items update on hunter_id.
  const { data: oldItem } = await sb
    .from('wallet_items')
    .select('id, type')
    .eq('id', oldWalletItemId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (!oldItem) return { error: 'Original wallet item not found.' }

  // Type must match (can't swap a license link to a tag, etc).
  if (oldItem.type !== newItem.type) {
    return { error: `Type mismatch — current link is a ${oldItem.type}; can't swap to a ${newItem.type}.` }
  }

  // Tag-specific edge case: if a harvest_log_entry references the OLD tag,
  // block. Guide must edit the entry to retarget the tag_wallet_item_id
  // first. Keeps the audit trail clean.
  // v27.1.1.0.3a: replaces the harvests.consumed_wallet_item_id check with
  // the new harvest_log_entries.tag_wallet_item_id column. The new schema
  // ties entries to harvest_logs (one log per trip), so we filter via the
  // log's trip_id.
  if (oldItem.type === 'tag') {
    const { data: linkedEntries } = await sb
      .from('harvest_log_entries')
      .select('id, harvest_logs!inner(trip_id)')
      .eq('tag_wallet_item_id', oldWalletItemId)
      .eq('harvest_logs.trip_id', tripId)
      .limit(1)
    if (linkedEntries && linkedEntries.length > 0) {
      return {
        error:
          "This tag has been used for a harvest. Ask the guide to edit the entry to change the tag.",
      }
    }
  }

  // Update the trip_wallet_items row keyed by (trip_id, hunter_id,
  // wallet_item_id=old). Single row given the (trip_id, hunter_id,
  // wallet_item_id) UNIQUE constraint.
  const { error: updErr } = await sb
    .from('trip_wallet_items')
    .update({ wallet_item_id: newWalletItemId, linked_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .eq('hunter_id', profile.id)
    .eq('wallet_item_id', oldWalletItemId)
  if (updErr) {
    console.warn('[swapTripWalletItemAction]', { code: updErr.code, message: updErr.message })
    return { error: updErr.message || 'Could not swap wallet item.' }
  }

  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h/trips')
  revalidatePath('/app/h')
  revalidatePath(`/app/trips/${tripId}`)
  revalidatePath('/app/trips')
  revalidatePath('/app')
  return { ok: true }
}
