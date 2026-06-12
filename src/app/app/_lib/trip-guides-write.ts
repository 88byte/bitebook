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

  // Replace strategy: delete everyone, insert lead + assists. This
  // keeps the path single-statement-simple and the UNIQUE
  // (trip_id, guide_profile_id) check matches naturally on insert.
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

  const { error: insErr } = await admin.from('trip_guides').insert(rows)
  if (insErr) return { error: insErr.message }
  return { ok: true }
}
