'use server'

// v27.1.4 — Trip template actions.
// Save a trip's activity / location / hunt-details + non-log linked docs
// as a reusable template, clone a template into a new trip, edit/archive/
// delete templates. Schema lives in 20260503_v27_1_4_trip_templates.sql.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from './auth'
import { assertWriteAllowed } from './billing-tier'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { isValidMethod } from '@/lib/methods'
import { insertTrip, insertTripParticipants } from './queries'
import { ensureHarvestLog } from './harvest-log-queries'

type Kind = Database['public']['Enums']['harvest_kind']

export type SaveTripAsTemplateResult =
  | { ok: true; id: string; replaced: boolean; doc_count: number }
  | { error: string }

// Save a trip as a template. Copies activity / location / hunt-details
// scalars + every non-log linked doc (waivers + resources) into the new
// template. Logs are excluded — harvest logs are unique per trip.
//
// v27.9.12: same-label upsert. If a non-archived template with this
// label already exists for this owner, the action UPDATES its scalars
// AND replaces its trip_template_docs with a fresh snapshot from the
// current trip — instead of silently creating a duplicate that has its
// own (possibly stale) doc set.
//
// Root cause this fixes: the original save flow snapshotted docs only
// at creation time and there was no path to refresh them. Guides who
// saved a template before attaching waivers/resources to their source
// trip ended up with an empty template — subsequent clones produced
// trips with zero docs. Re-saving with the same name now refreshes the
// snapshot.
export async function saveTripAsTemplateAction(
  tripId: string,
  label: string
): Promise<SaveTripAsTemplateResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const trimmed = (label ?? '').trim()
  if (!tripId) return { error: 'Missing trip id.' }
  if (!trimmed) return { error: 'Template name is required.' }
  if (trimmed.length > 120) return { error: 'Template name is too long (120 char max).' }

  const sb = await createClient()
  const { data: trip, error: tripErr } = await sb
    .from('trips')
    .select('id, kind, city, state, zone, county, species_targeted, method')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (tripErr || !trip) return { error: 'Trip not found.' }

  // v27.9.12: collect the source trip's non-log docs ONCE up front. Used
  // by both the create and the replace paths, and surfaced in the result
  // so the UI can render a "saved N docs" / "updated to N docs" toast.
  const { data: linked } = await sb
    .from('trip_docs')
    .select('doc_id, docs!inner(id, kind)')
    .eq('trip_id', tripId)
  type LinkedRow = { doc_id: string; docs: { id: string; kind: string } }
  const linkedRows = (linked as LinkedRow[] | null ?? [])
    .filter((r) => r.docs?.kind && r.docs.kind !== 'log')
  const nonLogDocIds = linkedRows.map((r) => r.doc_id)
  const kindByDocId = new Map<string, string>()
  for (const r of linkedRows) {
    if (r.docs?.id && r.docs?.kind) kindByDocId.set(r.docs.id, r.docs.kind)
  }

  // Same-label active template already exists? UPSERT semantics: refresh
  // scalars + replace doc snapshot. Else create new template.
  const { data: existing } = await sb
    .from('trip_templates')
    .select('id')
    .eq('owner_id', profile.id)
    .ilike('label', trimmed)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  let templateId: string
  let replaced = false
  if (existing?.id) {
    templateId = existing.id
    replaced = true
    const { error: updErr } = await sb
      .from('trip_templates')
      .update({
        label: trimmed,
        activity: trip.kind,
        state: trip.state || null,
        city: trip.city,
        location_zone: trip.zone,
        location_county: trip.county,
        species_targeted: trip.species_targeted,
        method: trip.method,
      })
      .eq('id', templateId)
      .eq('owner_id', profile.id)
    if (updErr) {
      console.warn('[trip-template.save:update]', { code: updErr.code, message: updErr.message })
      return { error: updErr.message || 'Could not update template.' }
    }
    // Replace the doc snapshot: delete existing template_docs, then
    // re-insert from the current trip's docs (handled below in the
    // shared insert path).
    const { error: delErr } = await sb
      .from('trip_template_docs')
      .delete()
      .eq('template_id', templateId)
    if (delErr) {
      console.warn('[trip-template.save:wipe_docs]', { code: delErr.code, message: delErr.message })
      return { error: delErr.message || 'Could not refresh template docs.' }
    }
  } else {
    const { data: created, error: insErr } = await sb
      .from('trip_templates')
      .insert({
        owner_id: profile.id,
        label: trimmed,
        activity: trip.kind,
        state: trip.state || null,
        city: trip.city,
        location_zone: trip.zone,
        location_county: trip.county,
        species_targeted: trip.species_targeted,
        method: trip.method,
      })
      .select('id')
      .single()
    if (insErr || !created) {
      console.warn('[trip-template.save:insert]', { code: insErr?.code, message: insErr?.message })
      return { error: insErr?.message || 'Could not create template.' }
    }
    templateId = created.id
  }

  // Shared doc-link insert path. Runs for both new and replaced templates.
  // v27.1.3 default: waiver → 'sign', resource → null, other → null.
  if (nonLogDocIds.length > 0) {
    const { error: linkErr } = await sb
      .from('trip_template_docs')
      .insert(
        nonLogDocIds.map((doc_id) => ({
          template_id: templateId,
          doc_id,
          required_action_type:
            kindByDocId.get(doc_id) === 'waiver' ? 'sign' : null,
        }))
      )
    if (linkErr) {
      console.warn('[trip-template.save:link]', { code: linkErr.code, message: linkErr.message })
      // Soft fail: scalars saved/updated, docs didn't. Surface as error
      // so the user knows the template won't carry docs on clone.
      return { error: linkErr.message || 'Saved template details but could not save docs.' }
    }
  }

  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  return { ok: true, id: templateId, replaced, doc_count: nonLogDocIds.length }
}

// Clone a template into a new trip. Pre-fills activity / location /
// hunt-details from the template, takes name / dates / hunters from the
// caller. Linked docs auto-attach to the new trip via trip_docs.
export async function createTripFromTemplateAction(formData: FormData) {
  const { user, profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) {
    redirect('/app/settings?tab=billing&billing_error=read_only')
  }
  const templateId = String(formData.get('template_id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const startsAt = String(formData.get('starts_at') ?? '').trim()
  const endsAt = String(formData.get('ends_at') ?? '').trim()
  const hunterIds = formData.getAll('hunter_ids').map((v) => String(v)).filter(Boolean)
  const notesInput = String(formData.get('notes') ?? '').trim()

  if (!templateId) throw new Error('Missing template id.')
  if (!title) throw new Error('Trip name is required.')
  if (!startsAt) throw new Error('Trip start date is required.')

  const sb = await createClient()
  const { data: tpl, error: tplErr } = await sb
    .from('trip_templates')
    .select('activity, state, city, location_zone, location_county, species_targeted, method')
    .eq('id', templateId)
    .eq('owner_id', profile.id)
    .is('archived_at', null)
    .maybeSingle()
  if (tplErr || !tpl) throw new Error('Template not found.')

  const kindRaw = tpl.activity
  const kind = (kindRaw === 'fishing' ? 'fishing' : 'hunting') as Kind
  const stateRaw = (tpl.state ?? '').toUpperCase()
  if (!stateRaw || stateRaw.length !== 2) {
    throw new Error('Template is missing a valid state — edit the template first.')
  }
  const method = tpl.method && isValidMethod(tpl.method) ? tpl.method : null

  const insertResult = await insertTrip(profile.id, {
    title,
    kind,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    location_name: null,
    city: tpl.city,
    state: stateRaw,
    zone: tpl.location_zone,
    county: tpl.location_county,
    species_targeted: tpl.species_targeted,
    method,
    notes: notesInput || null,
  })
  if ('error' in insertResult) throw new Error(insertResult.error)
  const newTripId = insertResult.id

  if (hunterIds.length > 0) {
    const partResult = await insertTripParticipants(profile.id, newTripId, hunterIds)
    if ('error' in partResult) {
      console.warn('[trip-template.create:participants]', { error: partResult.error })
    } else {
      // v27.1.3.0.3: auto-create the harvest log on first hunter join.
      // Idempotent.
      try {
        await ensureHarvestLog(newTripId, profile.id)
      } catch (e) {
        console.warn('[trip-template.create:ensureHarvestLog]', e)
      }
    }
  }

  // v27.9.13: honor the user's docs-picker selection from the form.
  // Previously this action auto-attached EVERY template doc and
  // ignored doc_ids from FormData entirely. Now the form pre-checks
  // template docs and submits whatever's checked; user can uncheck
  // to exclude a template doc on this specific clone. We also keep
  // required_action_type per doc so the per-hunter action
  // materialization still works for waivers (kind='waiver' → 'sign').
  const formDocIds = formData.getAll('doc_ids').map((v) => String(v)).filter(Boolean)
  const { data: tplDocs } = await sb
    .from('trip_template_docs')
    .select('doc_id, required_action_type')
    .eq('template_id', templateId)
  const tplDocRows = (tplDocs ?? []) as Array<{
    doc_id: string
    required_action_type: string | null
  }>
  const reqByDocId = new Map(tplDocRows.map((r) => [r.doc_id, r.required_action_type]))
  // Final attach list = whatever the user submitted. Defense-in-depth
  // dedupe in case the form submitted duplicates. Falls back to the
  // template's full set when no doc_ids were submitted (covers legacy
  // clients + the edge case where the form never rendered the picker).
  const attachDocIds = Array.from(
    new Set(formDocIds.length > 0 ? formDocIds : tplDocRows.map((r) => r.doc_id))
  )
  if (attachDocIds.length > 0) {
    const { data: createdTripDocs, error: linkErr } = await sb
      .from('trip_docs')
      .insert(
        attachDocIds.map((doc_id) => ({
          trip_id: newTripId,
          doc_id,
          hunter_visible: true,
        }))
      )
      .select('id, doc_id')
    if (linkErr) {
      console.warn('[trip-template.create:link_docs]', { code: linkErr.code, message: linkErr.message })
    }
    // Materialize per-hunter action rows for every (hunter × doc) where
    // the template specified a required_action_type. Skip docs the
    // user added through the picker that aren't on the template — those
    // get the autoAssignActionsForTripDoc default per v27.9.8b.1
    // (action_type derived by doc kind). We only insert hand-rolled
    // rows here for docs that came from the template AND have an
    // explicit required_action_type the template recorded.
    if (createdTripDocs && createdTripDocs.length > 0 && hunterIds.length > 0) {
      const actionRows: Array<{
        trip_doc_id: string
        hunter_id: string
        action_type: 'sign' | 'view'
        required: boolean
      }> = []
      for (const r of createdTripDocs) {
        const req = reqByDocId.get(r.doc_id)
        if (req !== 'sign' && req !== 'view') continue
        for (const hunterId of hunterIds) {
          actionRows.push({
            trip_doc_id: r.id,
            hunter_id: hunterId,
            action_type: req,
            required: true,
          })
        }
      }
      if (actionRows.length > 0) {
        const { error: actErr } = await sb.from('trip_doc_hunter_actions').insert(actionRows)
        if (actErr) {
          console.warn('[trip-template.create:link_actions]', {
            code: actErr.code,
            message: actErr.message,
          })
        }
      }
    }
  }

  // Mark first_trip onboarding step done. Same as createTripAction.
  try {
    await (await createClient())
      .from('onboarding_progress')
      .upsert({ user_id: user.id, steps_completed: ['first_trip'] }, { onConflict: 'user_id' })
  } catch (e) {
    console.warn('[trip-template.create:onboarding]', e)
  }

  revalidatePath('/app')
  revalidatePath('/app/trips')
  revalidatePath('/app/h')
  revalidatePath('/app/h/trips')
  redirect(`/app/trips/${newTripId}`)
}

export type UpdateTripTemplateResult = { ok: true } | { error: string }

export async function updateTripTemplateAction(formData: FormData): Promise<UpdateTripTemplateResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  const templateId = String(formData.get('template_id') ?? '').trim()
  if (!templateId) return { error: 'Missing template id.' }

  const label = String(formData.get('label') ?? '').trim()
  if (!label) return { error: 'Template name is required.' }
  if (label.length > 120) return { error: 'Template name is too long.' }

  const activityRaw = String(formData.get('activity') ?? '').trim()
  const activity = activityRaw === 'fishing' ? 'fishing' : activityRaw === 'hunting' ? 'hunting' : null

  const stateRaw = String(formData.get('state') ?? '').trim().toUpperCase()
  const state = stateRaw && stateRaw.length === 2 ? stateRaw : null
  const city = String(formData.get('city') ?? '').trim() || null
  const zone = String(formData.get('location_zone') ?? '').trim() || null
  const county = String(formData.get('location_county') ?? '').trim() || null
  const speciesTargeted = String(formData.get('species_targeted') ?? '').trim() || null
  const methodRaw = String(formData.get('method') ?? '').trim()
  const method = methodRaw && isValidMethod(methodRaw) ? methodRaw : null

  const sb = await createClient()
  const { error } = await sb
    .from('trip_templates')
    .update({
      label,
      activity,
      state,
      city,
      location_zone: zone,
      location_county: county,
      species_targeted: speciesTargeted,
      method,
    })
    .eq('id', templateId)
    .eq('owner_id', profile.id)
  if (error) {
    console.warn('[trip-template.update]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save template.' }
  }
  revalidatePath('/app/trips')
  return { ok: true }
}

export async function archiveTripTemplateAction(templateId: string): Promise<UpdateTripTemplateResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  if (!templateId) return { error: 'Missing template id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('trip_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('owner_id', profile.id)
    .is('archived_at', null)
  if (error) return { error: error.message || 'Could not archive template.' }
  revalidatePath('/app/trips')
  return { ok: true }
}

export async function unarchiveTripTemplateAction(templateId: string): Promise<UpdateTripTemplateResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  if (!templateId) return { error: 'Missing template id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('trip_templates')
    .update({ archived_at: null })
    .eq('id', templateId)
    .eq('owner_id', profile.id)
    .not('archived_at', 'is', null)
  if (error) return { error: error.message || 'Could not restore template.' }
  revalidatePath('/app/trips')
  return { ok: true }
}

export async function deleteTripTemplateAction(templateId: string): Promise<UpdateTripTemplateResult> {
  const { profile } = await requireGuide()
  const gate = await assertWriteAllowed(profile.id)
  if ('error' in gate) return { error: gate.error }
  if (!templateId) return { error: 'Missing template id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('trip_templates')
    .delete()
    .eq('id', templateId)
    .eq('owner_id', profile.id)
  if (error) return { error: error.message || 'Could not delete template.' }
  revalidatePath('/app/trips')
  return { ok: true }
}
