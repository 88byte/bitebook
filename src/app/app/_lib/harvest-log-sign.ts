'use server'

// v27.2.0.3.1 — sign harvest log PDFs.
//
// Takes an already-generated trip_generated_logs row + a signature
// PNG data URL, produces a signed copy of the PDF:
//   1. Downloads the existing generated PDF.
//   2. Looks up doc_field_mappings for the source doc to find any
//      AcroForm text fields mapped to data_source_path = 'signature_
//      date.now'. Fills those with today's date in MM/DD/YYYY (US
//      state-form locale).
//   3. Resolves signature placement via the shared
//      signature-placement.ts helper (mapping → drag-place → default
//      precedence), with role='guide' since harvest logs are signed
//      by the guide.
//   4. Embeds the signature PNG at each resolved placement.
//   5. Saves the result to bb-private/signed/{guide_id}/{trip_id}/
//      {generated_log_id}-signed-{ts}.pdf via the user-session client
//      (signed_owner_all RLS policy gates this prefix).
//   6. Inserts a doc_signatures row capturing signer_id, signature
//      data, signed_at, ip_address, user_agent.
//   7. Updates the trip_generated_logs row with signed_file_path /
//      signed_file_name / signed_at.
//
// Re-sign: if signed_file_path already set, the old signed object is
// replaced via storage upsert at the same path AND a fresh
// doc_signatures row is appended (audit history shows every signing
// event, never overwritten).

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from './auth'
import {
  resolvePlacements,
  computeDrawPosition,
  type MappingRow,
} from './signature-placement'

export type SignHarvestLogResult =
  | { ok: true; signedFilePath: string; signedAt: string }
  | { error: string }

// US state harvest-log convention: MM/DD/YYYY.
function fmtDateMMDDYYYY(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const y = d.getFullYear()
  return `${m}/${day}/${y}`
}

// Parse a `data:image/png;base64,...` data URL into raw bytes.
function decodeSignaturePngDataUrl(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) {
    throw new Error('Signature must be a base64-encoded PNG data URL.')
  }
  return Uint8Array.from(Buffer.from(m[1], 'base64'))
}

export async function signHarvestLogPdfAction(
  generatedLogId: string,
  signatureDataUrl: string
): Promise<SignHarvestLogResult> {
  const { profile, user } = await requireGuide()
  if (!generatedLogId) return { error: 'Missing generated log id.' }
  if (!signatureDataUrl) return { error: 'Missing signature.' }
  if (signatureDataUrl.length > 2_000_000) {
    return { error: 'Signature image is too large (max ~2MB).' }
  }

  const sb = await createClient()

  // 1. Load the row + verify ownership via RLS-enforced trip read.
  const { data: row, error: rowErr } = await sb
    .from('trip_generated_logs')
    .select('id, trip_id, source_doc_id, file_path, file_name, signed_file_path')
    .eq('id', generatedLogId)
    .maybeSingle()
  if (rowErr || !row) {
    return { error: rowErr?.message || 'Generated PDF not found.' }
  }
  // RLS additionally gates that this profile owns the trip; defense-
  // in-depth via direct trip lookup.
  const { data: trip, error: tripErr } = await sb
    .from('trips')
    .select('id, guide_id')
    .eq('id', row.trip_id)
    .maybeSingle()
  if (tripErr || !trip) return { error: 'Trip not found.' }
  if (trip.guide_id !== profile.id) {
    return { error: 'Only the trip owner can sign this report.' }
  }

  // 2. Download the existing generated PDF.
  const { data: blob, error: dlErr } = await sb.storage
    .from('bb-private')
    .download(row.file_path)
  if (dlErr || !blob) {
    console.warn('[sign:download]', { path: row.file_path, message: dlErr?.message })
    return { error: dlErr?.message || 'Could not load the generated PDF.' }
  }
  const baseBytes = new Uint8Array(await blob.arrayBuffer())

  // 3. Pull doc_field_mappings rows for the source doc — used by both
  // signature_date.now text fills and the shared placement resolver.
  const dateFieldNames: string[] = []
  let allMappings: MappingRow[] = []
  if (row.source_doc_id) {
    const { data: maps } = await sb
      .from('doc_field_mappings')
      .select('field_name, data_source_path, mapping_kind, signature_role, placement_coords')
      .eq('doc_id', row.source_doc_id)
    allMappings = (maps ?? []) as MappingRow[]
    for (const m of allMappings) {
      if ((m.mapping_kind ?? 'field') === 'field' && m.data_source_path === 'signature_date.now') {
        dateFieldNames.push(m.field_name)
      }
    }
  }

  // 4. Compose the signed PDF.
  const pdf = await PDFDocument.load(baseBytes, { ignoreEncryption: true })

  // 4a. Fill any signature_date.now text fields with today's date.
  if (dateFieldNames.length > 0) {
    try {
      const form = pdf.getForm()
      const today = fmtDateMMDDYYYY(new Date())
      for (const name of dateFieldNames) {
        try {
          const field = form.getField(name)
          if (field instanceof PDFTextField) {
            field.setText(today)
          }
        } catch {
          // Field name from the saved mapping may not exist on a
          // replaced/edited PDF — skip silently.
        }
      }
      // v27.2.0.3.2: gen-time no longer flattens (so signature_date.now
      // fields stay live for us to fill here). Bake everything in now
      // so the final signed output isn't editable.
      try {
        form.flatten()
      } catch {
        /* leave editable if flatten fails */
      }
    } catch {
      /* form not present or unreadable — proceed with image-only */
    }
  }

  // 4b. Embed the signature image + draw at every resolved placement.
  // Harvest logs are signed by the guide, so role='guide' for the
  // resolver (mapping → drag-place → default precedence).
  let signaturePng
  try {
    const png = decodeSignaturePngDataUrl(signatureDataUrl)
    signaturePng = await pdf.embedPng(png)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not decode signature image.' }
  }
  const pages = pdf.getPages()
  if (pages.length === 0) {
    return { error: 'Generated PDF has no pages.' }
  }
  const placements = resolvePlacements(pdf, allMappings, 'guide')
  for (const placement of placements) {
    const page = pages[placement.pageIndex]
    if (!page) continue
    const draw = computeDrawPosition(placement, signaturePng.width, signaturePng.height)
    page.drawImage(signaturePng, {
      x: draw.x,
      y: draw.y,
      width: draw.w,
      height: draw.h,
    })
  }

  const signedBytes = await pdf.save()

  // 5. Upload to bb-private/signed/{guide_id}/{trip_id}/{generated_log_id}-signed-{ts}.pdf.
  // Always-fresh suffix on first sign; on re-sign we overwrite at the
  // existing signed_file_path so cached signed-URL keys stay stable.
  let signedFilePath: string
  let signedFileName: string
  const baseName = row.file_name.toLowerCase().endsWith('.pdf')
    ? row.file_name.slice(0, -4)
    : row.file_name
  if (row.signed_file_path) {
    signedFilePath = row.signed_file_path
    // Keep the existing signed_file_name on the row.
    signedFileName = row.file_name.replace(/(\.pdf)?$/i, '-signed.pdf')
  } else {
    const ts = Date.now()
    signedFileName = `${baseName}-signed.pdf`
    signedFilePath = `signed/${profile.id}/${row.trip_id}/${row.id}-signed-${ts}.pdf`
  }

  const { error: upErr } = await sb.storage
    .from('bb-private')
    .upload(signedFilePath, signedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) {
    console.warn('[sign:upload]', { path: signedFilePath, message: upErr.message })
    return { error: upErr.message || 'Could not upload signed PDF.' }
  }

  // 6. Insert doc_signatures row + 7. update trip_generated_logs.
  const signedAt = new Date().toISOString()
  // Audit metadata — best-effort. Headers are read via next/headers
  // which is cheap on a server action.
  let ipAddress: string | null = null
  let userAgent: string | null = null
  try {
    const h = await headers()
    ipAddress =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null
    userAgent = h.get('user-agent') || null
  } catch {
    /* headers unavailable — leave null */
  }

  // Compress the audit row by hashing the signature bytes. Storing the
  // full data URL (~2–50KB per signature) in every audit row bloats the
  // table without adding security; the rendered signature lives in the
  // signed PDF itself, which is the canonical artifact.
  const signatureHash = createHash('sha256').update(signatureDataUrl).digest('hex')

  const { error: sigErr } = await sb.from('doc_signatures').insert({
    trip_generated_log_id: row.id,
    signer_id: profile.id,
    signature_data: `sha256:${signatureHash}`,
    signed_at: signedAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  })
  if (sigErr) {
    console.warn('[sign:audit-insert]', { code: sigErr.code, message: sigErr.message })
    // Don't fail the whole action — the signed PDF is already saved.
    // Audit-row failure surfaces as a warning; future hardening could
    // unwind the storage write, but for now a missing audit row is
    // recoverable manually.
  }

  const { error: updErr } = await sb
    .from('trip_generated_logs')
    .update({
      signed_file_path: signedFilePath,
      signed_file_name: signedFileName,
      signed_at: signedAt,
    })
    .eq('id', row.id)
  if (updErr) {
    console.warn('[sign:row-update]', { code: updErr.code, message: updErr.message })
    return { error: updErr.message || 'Could not stamp the signed status on the row.' }
  }

  revalidatePath(`/app/trips/${row.trip_id}/log`)
  // Ensure unused user var is referenced for lint cleanliness.
  void user
  return { ok: true, signedFilePath, signedAt }
}
