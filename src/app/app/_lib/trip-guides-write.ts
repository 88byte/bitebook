// v28.1.0f.1 Sprint 3.4b — write helpers for trip_guides.
//
// Server actions call setTripGuides() after a trip insert or update
// to replace the assignment set. The lead row is also mirrored back
// onto trips.guide_id so legacy reads (queries.fetchTripsPage etc.)
// keep working without backfill timing risk during the read switch
// in 3.4c.

import { createAdminClient } from '@/lib/supabase/admin'

export type SetTripGuidesInput = {
  trip_id: string
  lead_guide_id: string
  assist_guide_ids: string[]
  assigned_by: string
}

export async function setTripGuides(input: SetTripGuidesInput): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()

  // Mirror lead to legacy trips.guide_id (idempotent).
  const { error: tripErr } = await admin
    .from('trips')
    .update({ guide_id: input.lead_guide_id })
    .eq('id', input.trip_id)
  if (tripErr) return { error: tripErr.message }

  // v28.1.0f.2 — replace strategy is still delete-then-insert as the
  // canonical reset, but the insert path is now an UPSERT with
  // onConflict on (trip_id, guide_profile_id) so a concurrent or
  // out-of-order trigger row cannot collide with our explicit set.
  // The AFTER INSERT trigger on trips was promoted to SECURITY
  // DEFINER in migration v28_1_0f_2_trips_lead_guide_trigger_security_definer
  // so it no longer hits RLS; this upsert is belt-and-braces against
  // any future trigger row showing up between our delete and insert.
  await admin.from('trip_guides').delete().eq('trip_id', input.trip_id)

  const rows: Array<{
    trip_id: string
    guide_profile_id: string
    role: 'lead' | 'assist'
    assigned_by: string
  }> = [
    {
      trip_id: input.trip_id,
      guide_profile_id: input.lead_guide_id,
      role: 'lead',
      assigned_by: input.assigned_by,
    },
    ...input.assist_guide_ids
      .filter((id) => id && id !== input.lead_guide_id)
      .map((id) => ({
        trip_id: input.trip_id,
        guide_profile_id: id,
        role: 'assist' as const,
        assigned_by: input.assigned_by,
      })),
  ]

  const { error: insErr } = await admin
    .from('trip_guides')
    .upsert(rows, { onConflict: 'trip_id,guide_profile_id' })
  if (insErr) return { error: insErr.message }
  return { ok: true }
}
