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

type PlacementCoords = {
  page?: number
  x?: number
  y?: number
  w?: number
  h?: number
}

export async function signWaiverAction(
  tripDocActionId: string,
  signatureDataUrl: string
): Promise<SignWaiverResult> {
  const { user, profile } = await requireUser()
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

  // 3. Load mappings: hunter-role signature placements + signature_date.now
  // text fields. v27.2.0.3 placement wizard will let guides save coords
  // here; until then placements is usually empty and we fall back.
  type MappingRow = {
    field_name: string
    data_source_path: string | null
    mapping_kind: string | null
    signature_role: string | null
    placement_coords: unknown
  }
  const { data: maps } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, mapping_kind, signature_role, placement_coords')
    .eq('doc_id', doc.id)

  const placements: PlacementCoords[] = []
  const dateFieldNames: string[] = []
  for (const m of (maps ?? []) as MappingRow[]) {
    if (m.mapping_kind === 'signature' && m.signature_role === 'hunter') {
      const coords = (m.placement_coords ?? null) as PlacementCoords | null
      if (coords) placements.push(coords)
    }
    if ((m.mapping_kind ?? 'field') === 'field' && m.data_source_path === 'signature_date.now') {
      // v27.2.0.3 will gate the date fill on signature_role too. Today
      // we fill any signature_date.now field on a hunter sign — the
      // common waiver case is "Hunter Date Signed" only, so this is
      // safe in practice.
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
  const mmToPt = (mm: number) => mm * 2.8346

  function drawAt(coords: PlacementCoords | null) {
    const pageIndex = coords?.page ?? pages.length - 1
    const page = pages[Math.max(0, Math.min(pageIndex, pages.length - 1))]
    if (!page) return
    const { width: pageWidth, height: pageHeight } = page.getSize()
    const boxW = coords?.w ?? mmToPt(68)
    const boxH = coords?.h ?? mmToPt(22)
    const boxX = coords?.x ?? pageWidth - boxW - mmToPt(10)
    const boxY = coords?.y ?? mmToPt(30)

    // Letterbox preserving aspect ratio inside the box.
    const imgRatio = signaturePng.width / Math.max(signaturePng.height, 1)
    const boxRatio = boxW / boxH
    let drawW = boxW
    let drawH = boxH
    if (imgRatio > boxRatio) drawH = boxW / imgRatio
    else drawW = boxH * imgRatio
    const drawX = boxX + (boxW - drawW) / 2
    const drawY = boxY + (boxH - drawH) / 2
    void pageHeight
    page.drawImage(signaturePng, { x: drawX, y: drawY, width: drawW, height: drawH })
  }

  if (placements.length === 0) {
    drawAt(null) // default placement
  } else {
    for (const p of placements) drawAt(p)
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
