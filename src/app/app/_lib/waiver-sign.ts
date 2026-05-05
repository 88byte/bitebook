'use server'

// v27.2.0.2 — sign a waiver-style trip-doc as a hunter.
//
// Mirrors signHarvestLogPdfAction (v27.2.0.1) but anchors on a
// trip_doc_hunter_action row instead of a trip_generated_logs row.
// Loads the underlying doc, embeds the signature image at any saved
// hunter-role placement coords (or default bottom-right of the last
// page when no placements are saved), fills any
// signature_date.now-mapped text fields, saves to
// bb-private/signed/{hunter_id}/waivers/{trip_id}/{doc_id}-signed-{ts}.pdf,
// inserts a doc_signatures row, and marks the action completed_at.
//
// v27.2.0.3 will introduce the placement wizard so guides can drag
// signature boxes onto the form. Until then any placement_coords rows
// are honored if present, otherwise the default falls through.

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PDFDocument, PDFTextField, type PDFImage } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from './auth'
import { assertWriteAllowed } from './billing-tier'
import { resolvePlacements, computeDrawPosition, type MappingRow } from './signature-placement'

export type SignWaiverResult =
  | { ok: true; signedFilePath: string; signedAt: string }
  | { error: string }

function fmtDateMMDDYYYY(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}/${day}/${y}`
}

function decodeSignaturePngDataUrl(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) throw new Error('Signature must be a base64-encoded PNG data URL.')
  return Uint8Array.from(Buffer.from(m[1], 'base64'))
}

// PlacementCoords moved to signature-placement.ts in v27.2.0.3.

export async function signWaiverAction(
  tripDocActionId: string,
  signatureDataUrl: string
): Promise<SignWaiverResult> {
  const { user, profile } = await requireUser()
  const gate = await assertWriteAllowed(profile.id, profile.role)
  if ('error' in gate) return { error: gate.error }
  if (!tripDocActionId) return { error: 'Missing action id.' }
  if (!signatureDataUrl) return { error: 'Missing signature.' }
  if (signatureDataUrl.length > 2_000_000) {
    return { error: 'Signature image is too large (max ~2MB).' }
  }

  const sb = await createClient()

  // 1. Load the action + its parent doc. RLS on trip_doc_hunter_actions
  // gates the read to the assigned hunter (or the trip-owning guide);
  // we additionally check hunter_id below as defense-in-depth.
  type ActionJoinRow = {
    id: string
    hunter_id: string
    action_type: string
    completed_at: string | null
    trip_doc_id: string
    trip_docs: {
      id: string
      trip_id: string
      doc_id: string
      docs: {
        id: string
        kind: string
        file_path: string
        guide_id: string
      } | null
    } | null
  }
  const { data, error: actErr } = await sb
    .from('trip_doc_hunter_actions')
    .select(
      `id, hunter_id, action_type, completed_at, trip_doc_id,
       trip_docs!inner(id, trip_id, doc_id, docs:doc_id(id, kind, file_path, guide_id))`
    )
    .eq('id', tripDocActionId)
    .maybeSingle()
  const action = data as unknown as ActionJoinRow | null
  if (actErr || !action) {
    return { error: actErr?.message || 'Action not found.' }
  }
  if (action.hunter_id !== user.id) {
    return { error: 'Only the assigned hunter can sign this.' }
  }
  if (action.action_type !== 'sign') {
    return { error: 'This action isn’t a signature action.' }
  }
  const doc = action.trip_docs?.docs
  const tripId = action.trip_docs?.trip_id
  if (!doc || !tripId) return { error: 'Doc not found for this action.' }

  // 2. Download the original waiver PDF. RLS on storage already lets a
  // hunter read trip-attached docs via the existing trip_docs share.
  const { data: blob, error: dlErr } = await sb.storage
    .from('bb-private')
    .download(doc.file_path)
  if (dlErr || !blob) {
    console.warn('[sign-waiver:download]', { path: doc.file_path, message: dlErr?.message })
    return { error: dlErr?.message || 'Could not load the waiver PDF.' }
  }
  const baseBytes = new Uint8Array(await blob.arrayBuffer())

  // 3. Load all doc_field_mappings for the parent doc. The signature-
  // placement helper picks role-matched rows below; signature_date.now
  // text fields are filled inline.
  const { data: maps } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, mapping_kind, signature_role, placement_coords')
    .eq('doc_id', doc.id)

  const allMappings = (maps ?? []) as MappingRow[]
  const dateFieldNames: string[] = []
  for (const m of allMappings) {
    if ((m.mapping_kind ?? 'field') === 'field' && m.data_source_path === 'signature_date.now') {
      dateFieldNames.push(m.field_name)
    }
  }

  // 4. Compose the signed PDF.
  const pdf = await PDFDocument.load(baseBytes, { ignoreEncryption: true })

  if (dateFieldNames.length > 0) {
    try {
      const form = pdf.getForm()
      const today = fmtDateMMDDYYYY(new Date())
      for (const name of dateFieldNames) {
        try {
          const field = form.getField(name)
          if (field instanceof PDFTextField) field.setText(today)
        } catch {
          /* unknown field on a replaced PDF — skip */
        }
      }
      try { form.flatten() } catch { /* ignore */ }
    } catch {
      /* form unavailable — proceed image-only */
    }
  }

  let signaturePng: PDFImage
  try {
    const png = decodeSignaturePngDataUrl(signatureDataUrl)
    signaturePng = await pdf.embedPng(png)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not decode signature image.' }
  }

  const pages = pdf.getPages()
  if (pages.length === 0) return { error: 'Waiver PDF has no pages.' }

  // v27.2.0.3: precedence order via shared helper. Mapping-driven
  // (AcroForm widget rect) wins; drag-place fractions next; default
  // last-page bottom-right last.
  const placements = resolvePlacements(pdf, allMappings, 'hunter')
  for (const placement of placements) {
    const page = pages[placement.pageIndex]
    if (!page) continue
    // v27.2.0.3.1: bottom-anchor for mapping-driven, center for drag-
    // place / default. See computeDrawPosition for the rationale.
    const draw = computeDrawPosition(placement, signaturePng.width, signaturePng.height)
    page.drawImage(signaturePng, { x: draw.x, y: draw.y, width: draw.w, height: draw.h })
  }

  const signedBytes = await pdf.save()

  // 5. Upload to bb-private/signed/{hunter_id}/waivers/{trip_id}/{doc_id}-signed-{ts}.pdf.
  const ts = Date.now()
  const signedFilePath = `signed/${user.id}/waivers/${tripId}/${doc.id}-signed-${ts}.pdf`
  const { error: upErr } = await sb.storage
    .from('bb-private')
    .upload(signedFilePath, signedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) {
    console.warn('[sign-waiver:upload]', { path: signedFilePath, message: upErr.message })
    return { error: upErr.message || 'Could not upload signed waiver.' }
  }

  // 6. Insert doc_signatures audit row.
  const signedAt = new Date().toISOString()
  let ipAddress: string | null = null
  let userAgent: string | null = null
  try {
    const h = await headers()
    ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    userAgent = h.get('user-agent') || null
  } catch { /* ignore */ }
  const signatureHash = createHash('sha256').update(signatureDataUrl).digest('hex')
  const { error: sigErr } = await sb.from('doc_signatures').insert({
    trip_doc_hunter_action_id: action.id,
    signer_id: profile.id,
    signature_data: `sha256:${signatureHash}`,
    signed_at: signedAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  })
  if (sigErr) {
    console.warn('[sign-waiver:audit-insert]', { code: sigErr.code, message: sigErr.message })
    // Don't fail — signed PDF is saved. Manual recovery available.
  }

  // 7. Mark the action complete with the signed-PDF pointer in completed_data.
  const completedData = {
    signed_pdf_path: signedFilePath,
    signed_at: signedAt,
  } as unknown
  const { error: updErr } = await sb
    .from('trip_doc_hunter_actions')
    .update({
      completed_at: signedAt,
      completed_data: completedData as never,
    })
    .eq('id', action.id)
    .eq('hunter_id', user.id)
  if (updErr) {
    console.warn('[sign-waiver:action-update]', { code: updErr.code, message: updErr.message })
    return { error: updErr.message || 'Couldn’t flip the action to signed.' }
  }

  revalidatePath(`/app/h/trips/${tripId}`)
  revalidatePath('/app/h')
  return { ok: true, signedFilePath, signedAt }
}

// v27.2.0.3 — guide-side waiver signing.
//
// Anchors on trip_doc_id (per-trip-doc) instead of
// trip_doc_hunter_action_id. The guide signs a waiver once for the
// whole trip, regardless of how many hunters are on it.
//
// Storage path: signed/{guide_id}/waivers/{trip_id}/{doc_id}-signed-
// guide-{ts}.pdf (the -guide suffix keeps it distinct from the
// hunter-signed copy at the same trip level).
//
// Re-sign: appends a fresh doc_signatures row each time, but re-uses
// the same signed_file_path on storage upsert when set on the trip_doc
// (we read the latest doc_signatures row for trip_doc_id and overwrite
// at its signature_field_index path — actually, simpler: always
// timestamp the path on first sign, overwrite on re-sign by querying
// for the most recent signed file).
export async function signWaiverAsGuideAction(
  tripDocId: string,
  signatureDataUrl: string
): Promise<SignWaiverResult> {
  const { user, profile } = await requireUser()
  const gate = await assertWriteAllowed(profile.id, profile.role)
  if ('error' in gate) return { error: gate.error }
  if (!tripDocId) return { error: 'Missing trip-doc id.' }
  if (!signatureDataUrl) return { error: 'Missing signature.' }
  if (signatureDataUrl.length > 2_000_000) {
    return { error: 'Signature image is too large (max ~2MB).' }
  }
  if (profile.role !== 'guide') {
    return { error: 'Only guides can sign as guide.' }
  }

  const sb = await createClient()

  // Load trip_doc + parent doc + parent trip for ownership check.
  type TripDocRow = {
    id: string
    trip_id: string
    doc_id: string
    docs: { id: string; kind: string; file_path: string; guide_id: string } | null
    trip: { id: string; guide_id: string } | null
  }
  const { data, error: tdErr } = await sb
    .from('trip_docs')
    .select(
      `id, trip_id, doc_id,
       docs:doc_id(id, kind, file_path, guide_id),
       trip:trip_id(id, guide_id)`
    )
    .eq('id', tripDocId)
    .maybeSingle()
  const tripDoc = data as unknown as TripDocRow | null
  if (tdErr || !tripDoc) return { error: tdErr?.message || 'Trip-doc not found.' }
  if (!tripDoc.trip || tripDoc.trip.guide_id !== profile.id) {
    return { error: 'Only the trip owner can sign as guide.' }
  }
  const doc = tripDoc.docs
  if (!doc) return { error: 'Doc not found for this trip-doc.' }

  const { data: blob, error: dlErr } = await sb.storage
    .from('bb-private')
    .download(doc.file_path)
  if (dlErr || !blob) {
    console.warn('[sign-guide:download]', { path: doc.file_path, message: dlErr?.message })
    return { error: dlErr?.message || 'Could not load the waiver PDF.' }
  }
  const baseBytes = new Uint8Array(await blob.arrayBuffer())

  const { data: maps } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, mapping_kind, signature_role, placement_coords')
    .eq('doc_id', doc.id)
  const allMappings = (maps ?? []) as MappingRow[]
  const dateFieldNames: string[] = []
  for (const m of allMappings) {
    if ((m.mapping_kind ?? 'field') === 'field' && m.data_source_path === 'signature_date.now') {
      dateFieldNames.push(m.field_name)
    }
  }

  const pdf = await PDFDocument.load(baseBytes, { ignoreEncryption: true })

  if (dateFieldNames.length > 0) {
    try {
      const form = pdf.getForm()
      const today = fmtDateMMDDYYYY(new Date())
      for (const name of dateFieldNames) {
        try {
          const field = form.getField(name)
          if (field instanceof PDFTextField) field.setText(today)
        } catch { /* ignore */ }
      }
      try { form.flatten() } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  let signaturePng: PDFImage
  try {
    const png = decodeSignaturePngDataUrl(signatureDataUrl)
    signaturePng = await pdf.embedPng(png)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not decode signature image.' }
  }

  const pages = pdf.getPages()
  if (pages.length === 0) return { error: 'Waiver PDF has no pages.' }

  const placements = resolvePlacements(pdf, allMappings, 'guide')
  for (const placement of placements) {
    const page = pages[placement.pageIndex]
    if (!page) continue
    const draw = computeDrawPosition(placement, signaturePng.width, signaturePng.height)
    page.drawImage(signaturePng, { x: draw.x, y: draw.y, width: draw.w, height: draw.h })
  }

  const signedBytes = await pdf.save()
  const ts = Date.now()
  const signedFilePath = `signed/${user.id}/waivers/${tripDoc.trip_id}/${doc.id}-signed-guide-${ts}.pdf`
  const { error: upErr } = await sb.storage
    .from('bb-private')
    .upload(signedFilePath, signedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) {
    console.warn('[sign-guide:upload]', { path: signedFilePath, message: upErr.message })
    return { error: upErr.message || 'Could not upload signed waiver.' }
  }

  const signedAt = new Date().toISOString()
  let ipAddress: string | null = null
  let userAgent: string | null = null
  try {
    const h = await headers()
    ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    userAgent = h.get('user-agent') || null
  } catch { /* ignore */ }
  const signatureHash = createHash('sha256').update(signatureDataUrl).digest('hex')
  const { error: sigErr } = await sb.from('doc_signatures').insert({
    trip_doc_id: tripDoc.id,
    signer_id: profile.id,
    signature_data: `sha256:${signatureHash}`,
    signed_at: signedAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  })
  if (sigErr) {
    console.warn('[sign-guide:audit-insert]', { code: sigErr.code, message: sigErr.message })
  }

  revalidatePath(`/app/trips/${tripDoc.trip_id}`)
  return { ok: true, signedFilePath, signedAt }
}
