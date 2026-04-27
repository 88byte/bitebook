'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../_lib/auth'
import type { Database } from '@/lib/supabase/types'

type Kind = Database['public']['Enums']['harvest_kind']

// Create a trip + its initial trip_participants. Server-only — auth and guide
// gating run inside requireGuide(); RLS on trips/trip_participants does the
// final enforcement, so even a forged guide_id would be rejected.
export async function createTripAction(formData: FormData) {
  const { supabase, profile } = await requireGuide()

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

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      guide_id: profile.id,
      title,
      kind,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      location_name: locationName || null,
      notes,
      // status defaults to 'planned' per schema
    })
    .select('id')
    .single()

  if (tripErr || !trip) throw new Error(tripErr?.message ?? 'Could not create trip.')

  if (hunterIds.length > 0) {
    const rows = hunterIds.map((hunter_id) => ({ trip_id: trip.id, hunter_id }))
    const { error: partErr } = await supabase.from('trip_participants').insert(rows)
    if (partErr) {
      // Trip itself is committed; surface the partial-success state instead of
      // rolling back. The detail screen can show "no participants yet" and the
      // guide can re-add from there.
      console.warn('trip_participants insert failed', partErr.message)
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  redirect(`/app/trips/${trip.id}`)
}

export async function closeTripAction(formData: FormData) {
  const { supabase, profile } = await requireGuide()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) throw new Error('Missing trip id.')

  const { error } = await supabase
    .from('trips')
    .update({ status: 'completed' })
    .eq('id', tripId)
    .eq('guide_id', profile.id)
  if (error) throw new Error(error.message)

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
}
