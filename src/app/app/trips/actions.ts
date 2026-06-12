'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from '../_lib/auth'
import { assertWriteAllowed } from '../_lib/billing-tier'
import { insertTrip, insertTripParticipants, closeTrip } from '../_lib/queries'
import { ensureHarvestLog } from '../_lib/harvest-log-queries'
import { markStepDone } from '../_lib/onboarding'
import { setTripGuides } from '../_lib/trip-guides-write'
import { findGuideTripConflicts } from '../_lib/trip-conflicts'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'
import { isValidMethod } from '@/lib/methods'

type Kind = Database['public']['Enums']['harvest_kind']

// All writes route through helpers in queries.ts. Each takes the verified
// guideId from requireGuide(); RLS gates ownership on the DB side, with
// .eq('guide_id', guideId) as defense-in-depth.
export async function createTripAction(formData: FormData) {
  const { user, profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) {
    redirect('/app/settings?tab=billing&billing_error=read_only')
  }

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

  // v28.1.0f.1 Sprint 3.4b — guide assignment pickers. Optional for
  // pure guides (the creator is the lead by default). Outfitter
  // members get a real picker; the form posts the selected ids.
  const leadGuideIdRaw = String(formData.get('lead_guide_id') ?? '').trim()
  const assistGuideIds = formData.getAll('assist_guide_ids').map((v) => String(v)).filter(Boolean)
  const leadGuideId = leadGuideIdRaw || profile.id

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

  // v28.1.0f.1 — when an outfitter owner or admin creates a trip,
  // tag it with their current org id so it lands on the org
  // calendar. The AFTER INSERT trigger already mirrored profile.id
  // into trip_guides; setTripGuides below replaces that with the
  // real lead + assists picked on the form.
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  if (isOutfitterMember && profile.current_outfitter_org_id) {
    const admin = createAdminClient()
    await admin
      .from('trips')
      .update({ outfitter_org_id: profile.current_outfitter_org_id })
      .eq('id', insertResult.id)
  }

  // Persist the lead + assist set even when the form did not post
  // any (the trigger backed us up with the creator as lead, but
  // setTripGuides() is idempotent so re-running is safe).
  await setTripGuides({
    trip_id: insertResult.id,
    lead_guide_id: leadGuideId,
    assist_guide_ids: assistGuideIds,
    assigned_by: profile.id,
  })

  // Conflict warning, warn-only. Collect for ALL assigned guides
  // (lead + assists). Encoded into the redirect query so the trip
  // detail page can flash a callout.
  const conflictGuideIds = [leadGuideId, ...assistGuideIds].filter((v, i, a) => a.indexOf(v) === i)
  const conflicts = await findGuideTripConflicts({
    guide_ids: conflictGuideIds,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    exclude_trip_id: insertResult.id,
  })

  if (hunterIds.length > 0) {
    const partResult = await insertTripParticipants(profile.id, insertResult.id, hunterIds)
    if ('error' in partResult) {
      // Trip itself is committed; surface the partial-success state instead of
      // rolling back. The detail screen can show "no participants yet" and the
      // guide can re-add from there.
      console.warn('[createTripAction] participants insert failed', partResult.error)
    } else {
      // v27.1.3.0.3: auto-create the harvest log on first hunter join.
      // Idempotent — safe to call even if a future fix re-runs this path.
      try {
        await ensureHarvestLog(insertResult.id, profile.id)
      } catch (e) {
        console.warn('[createTripAction:ensureHarvestLog]', e)
      }
    }
  }

  // v27.6.2.1 — pre-creation doc attachment. The new-trip form's
  // right-column docs picker submits doc_ids; we attach each to the
  // newly-created trip via the same path /app/trips/[id] uses
  // post-creation. hunter_visible defaults to true so attached docs
  // are immediately visible to participants. Best-effort per doc:
  // a single attach failure logs + continues so the rest of the
  // selection still attaches.
  const docIds = formData.getAll('doc_ids').map((v) => String(v)).filter(Boolean)
  if (docIds.length > 0) {
    const sb = await createClient()
    for (const docId of docIds) {
      // Vet ownership inline (lightweight version of vetAttachableDoc):
      // doc must be owned by this guide OR be a Bite Book template,
      // not archived, not kind=log.
      const { data: doc } = await sb
        .from('docs')
        .select('id, kind, is_template, guide_id, archived_at')
        .eq('id', docId)
        .or(`guide_id.eq.${profile.id},is_template.eq.true`)
        .maybeSingle()
      if (!doc || doc.archived_at || doc.kind === 'log') continue
      const { error: attachErr } = await sb
        .from('trip_docs')
        .insert({
          trip_id: insertResult.id,
          doc_id: docId,
          hunter_visible: true,
          created_by: profile.id,
        })
      if (attachErr) {
        console.warn('[createTripAction:attach-doc]', { docId, message: attachErr.message })
      }
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
  revalidatePath('/app/calendar')
  // v27.0b.4.3: hunter-side dashboard + trips list bust so participating
  // hunters see the new trip on next load without a hard refresh.
  revalidatePath('/app/h')
  revalidatePath('/app/h/trips')
  // v28.1.0f.1 — pass conflict count as a flash param so the detail
  // page can warn without blocking. Warn-only per Flavio's decision.
  const conflictsParam = conflicts.length > 0 ? `?conflicts=${conflicts.length}` : ''
  redirect(`/app/trips/${insertResult.id}${conflictsParam}`)
}

export async function closeTripAction(formData: FormData) {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) {
    redirect('/app/settings?tab=billing&billing_error=read_only')
  }
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
