'use server'

// v27.1.4 — Trip template actions.
// Save a trip's activity / location / hunt-details + non-log linked docs
// as a reusable template, clone a template into a new trip, edit/archive/
// delete templates. Schema lives in 20260503_v27_1_4_trip_templates.sql.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireGuide } from './auth'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { isValidMethod } from '@/lib/methods'
import { insertTrip, insertTripParticipants } from './queries'

type Kind = Database['public']['Enums']['harvest_kind']

export type SaveTripAsTemplateResult =
  | { ok: true; id: string }
  | { error: string }

// Save a trip as a template. Copies activity / location / hunt-details
// scalars + every non-log linked doc (waivers + resources) into the new
// template. Logs are excluded — harvest logs are unique per trip.
export async function saveTripAsTemplateAction(
  tripId: string,
  label: string
): Promise<SaveTripAsTemplateResult> {
  const { profile } = await requireGuide()
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

  // Pull every doc currently attached to the trip whose kind != 'log',
  // then bulk-insert link rows. Single round-trip query for both.
  const { data: linked } = await sb
    .from('trip_docs')
    .select('doc_id, docs!inner(id, kind)')
    .eq('trip_id', tripId)
  type LinkedRow = { doc_id: string; docs: { id: string; kind: string } }
  const nonLogDocIds = (linked as LinkedRow[] | null ?? [])
    .filter((r) => r.docs?.kind && r.docs.kind !== 'log')
    .map((r) => r.doc_id)

  if (nonLogDocIds.length > 0) {
    // v27.1.3: capture a default required_action_type per doc kind.
    // waiver → 'sign', resource → null (informational), other kinds → null.
    // Editable later from the template detail. This is a sane default
    // that matches the most common guide intent (waivers must be signed
    // by every hunter; resources are reference material).
    const kindByDocId = new Map<string, string>()
    for (const r of (linked as LinkedRow[] | null ?? [])) {
      if (r.docs?.id && r.docs?.kind) kindByDocId.set(r.docs.id, r.docs.kind)
    }
    const { error: linkErr } = await sb
      .from('trip_template_docs')
      .insert(
        nonLogDocIds.map((doc_id) => ({
          template_id: created.id,
          doc_id,
          required_action_type:
            kindByDocId.get(doc_id) === 'waiver' ? 'sign' : null,
        }))
      )
    if (linkErr) {
      console.warn('[trip-template.save:link]', { code: linkErr.code, message: linkErr.message })
    }
  }

  revalidatePath('/app/trips')
  revalidatePath(`/app/trips/${tripId}`)
  return { ok: true, id: created.id }
}

// Clone a template into a new trip. Pre-fills activity / location /
// hunt-details from the template, takes name / dates / hunters from the
// caller. Linked docs auto-attach to the new trip via trip_docs.
export async function createTripFromTemplateAction(formData: FormData) {
  const { user, profile } = await requireGuide()
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
    }
  }

  // Carry the template's linked non-log docs onto the new trip.
  // v27.1.3: also pull required_action_type so we can materialize the
  // per-hunter sign/view requirements on the cloned trip's docs.
  const { data: tplDocs } = await sb
    .from('trip_template_docs')
    .select('doc_id, required_action_type')
    .eq('template_id', templateId)
  const tplDocRows = (tplDocs ?? []) as Array<{
    doc_id: string
    required_action_type: string | null
  }>
  if (tplDocRows.length > 0) {
    const { data: createdTripDocs, error: linkErr } = await sb
      .from('trip_docs')
      .insert(
        tplDocRows.map((r) => ({
          trip_id: newTripId,
          doc_id: r.doc_id,
          hunter_visible: true,
        }))
      )
      .select('id, doc_id')
    if (linkErr) {
      console.warn('[trip-template.create:link_docs]', { code: linkErr.code, message: linkErr.message })
    }
    // Materialize per-hunter action rows for every (hunter × doc) where
    // the template specified a required_action_type. v27.1.3 supports
    // 'sign' and 'view'. If the action_type doesn't match either, skip
    // — the template column is text not enum so a stale value doesn't
    // crash the clone.
    if (createdTripDocs && createdTripDocs.length > 0 && hunterIds.length > 0) {
      const tripDocByDocId = new Map(createdTripDocs.map((r) => [r.doc_id, r.id]))
      const reqByDocId = new Map(tplDocRows.map((r) => [r.doc_id, r.required_action_type]))
      const actionRows: Array<{
        trip_doc_id: string
        hunter_id: string
        action_type: 'sign' | 'view'
        required: boolean
      }> = []
      for (const docId of tripDocByDocId.keys()) {
        const req = reqByDocId.get(docId)
        if (req !== 'sign' && req !== 'view') continue
        const tripDocId = tripDocByDocId.get(docId)!
        for (const hunterId of hunterIds) {
          actionRows.push({
            trip_doc_id: tripDocId,
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
