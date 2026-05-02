'use server'

// v27.1.0 — Documents Module server actions (library CRUD).
// v27.1.1.0 — log mapping wizard server actions (extract + save).
// Auto-fill engine lands in v27.1.1.1.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from './auth'
import type { Database, TablesInsert, TablesUpdate } from '@/lib/supabase/types'
import { PDFDocument } from 'pdf-lib'
import {
  SKIP_VALUE,
  STATIC_TEXT_PREFIX,
  STATIC_DATE_PREFIX,
  STATIC_DATE_RANGE_PREFIX,
} from './doc-data-sources'

export type DocKind = Database['public']['Enums']['doc_kind']
type DocInsert = TablesInsert<'docs'>
type DocUpdate = TablesUpdate<'docs'>

export type DocActionResult =
  | { ok: true; id: string }
  | { error: string }

const ALL_KINDS: DocKind[] = ['waiver', 'log', 'resource']

function readForm(fd: FormData) {
  const get = (k: string): string | null => {
    const v = fd.get(k)
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
  }
  return get
}

// --- Create ---------------------------------------------------------------

// The PDF itself is uploaded client-side directly to Supabase Storage at
// `docs/{guide_id}/{tempId}.pdf` (bb-private bucket, RLS gated by the guide's
// auth.uid()). The form posts the resulting bucket-relative path here; this
// action just inserts the docs row pointing at it. After the row exists we
// move/rename the storage object to use the real doc_id so the path layout
// stays clean (`docs/{guide_id}/{doc_id}.pdf`).
export async function createDocAction(fd: FormData): Promise<DocActionResult> {
  const { profile } = await requireGuide()
  const get = readForm(fd)

  const kindRaw = get('kind')
  const label = get('label')
  const state = get('state')
  const tempPath = get('temp_path')
  const fileMime = get('file_mime') ?? 'application/pdf'

  if (!kindRaw || !ALL_KINDS.includes(kindRaw as DocKind)) {
    return { error: 'Pick a doc kind.' }
  }
  if (!label) return { error: 'Give the doc a label.' }
  if (!tempPath) return { error: 'Upload a file first.' }

  const kind = kindRaw as DocKind

  const sb = await createClient()

  // Insert with the temp path; we'll rename below to the canonical
  // `docs/{guide_id}/{doc_id}.{ext}` once we know the doc_id.
  const insert: DocInsert = {
    guide_id: profile.id,
    kind,
    label,
    state: state ?? null,
    file_path: tempPath,
    file_mime: fileMime,
    mapping_status: kind === 'resource' ? 'not_applicable' : 'unmapped',
  }
  const { data: inserted, error: insErr } = await sb
    .from('docs')
    .insert(insert)
    .select('id, guide_id, file_path')
    .single()
  if (insErr || !inserted) {
    console.warn('[docs.createDocAction:insert]', { code: insErr?.code, message: insErr?.message })
    return { error: insErr?.message || 'Could not create doc.' }
  }

  // Best-effort rename so storage layout matches the canonical pattern.
  // If the rename fails (e.g. file already at canonical name), we leave the
  // original temp path on the row — read paths use docs.file_path directly.
  const ext = (tempPath.split('.').pop() ?? 'pdf').toLowerCase()
  const finalPath = `docs/${profile.id}/${inserted.id}.${ext}`
  if (finalPath !== tempPath) {
    const { error: mvErr } = await sb.storage
      .from('bb-private')
      .move(tempPath, finalPath)
    if (!mvErr) {
      await sb.from('docs').update({ file_path: finalPath }).eq('id', inserted.id)
    } else {
      console.warn('[docs.createDocAction:rename]', { message: mvErr.message })
    }
  }

  revalidatePath('/app/docs')
  return { ok: true, id: inserted.id }
}

// --- Update ---------------------------------------------------------------

export async function updateDocAction(fd: FormData): Promise<DocActionResult> {
  const { profile } = await requireGuide()
  const get = readForm(fd)

  const docId = get('doc_id')
  const label = get('label')
  const state = get('state')
  const kindRaw = get('kind')
  if (!docId) return { error: 'Missing doc id.' }
  if (!label) return { error: 'Label is required.' }
  if (!kindRaw || !ALL_KINDS.includes(kindRaw as DocKind)) {
    return { error: 'Pick a doc kind.' }
  }
  const kind = kindRaw as DocKind

  const sb = await createClient()

  // Fetch current to detect kind change → recompute mapping_status default.
  const { data: cur } = await sb
    .from('docs')
    .select('id, kind, mapping_status')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!cur) return { error: 'Doc not found.' }

  const update: DocUpdate = { label, state: state ?? null, kind }
  if (cur.kind !== kind) {
    // Kind changed — reset mapping_status. Resource → not_applicable;
    // waiver/log → unmapped (any prior mappings are now meaningless and the
    // wizard will surface them again in v27.1.1+).
    update.mapping_status = kind === 'resource' ? 'not_applicable' : 'unmapped'
  }

  const { error } = await sb
    .from('docs')
    .update(update)
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (error) {
    console.warn('[docs.updateDocAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not update doc.' }
  }

  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
  return { ok: true, id: docId }
}

// --- Archive (soft-delete per locked decision §10.3) ----------------------

export async function archiveDocAction(docId: string): Promise<DocActionResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('docs')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (error) {
    console.warn('[docs.archiveDocAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not archive doc.' }
  }
  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
  return { ok: true, id: docId }
}

export async function restoreDocAction(docId: string): Promise<DocActionResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('docs')
    .update({ archived_at: null })
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (error) {
    console.warn('[docs.restoreDocAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not restore doc.' }
  }
  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
  return { ok: true, id: docId }
}

// --- Hard delete (only allowed when zero trip_docs references) ------------
// Per §10.3: hard-delete only allowed for archived docs with zero trip_docs
// references. The check below enforces both gates.

export async function deleteDocAction(docId: string): Promise<DocActionResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  const sb = await createClient()

  const { data: doc } = await sb
    .from('docs')
    .select('id, archived_at, file_path')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!doc) return { error: 'Doc not found.' }
  if (!doc.archived_at) {
    return { error: 'Archive the doc first, then delete it.' }
  }

  const { count, error: cntErr } = await sb
    .from('trip_docs')
    .select('*', { count: 'exact', head: true })
    .eq('doc_id', docId)
  if (cntErr) {
    console.warn('[docs.deleteDocAction:count]', { code: cntErr.code, message: cntErr.message })
    return { error: 'Could not verify trip references.' }
  }
  if ((count ?? 0) > 0) {
    return { error: 'This doc is still attached to one or more trips. Detach it first.' }
  }

  // Best-effort storage cleanup.
  if (doc.file_path) {
    await sb.storage.from('bb-private').remove([doc.file_path])
  }

  const { error: delErr } = await sb
    .from('docs')
    .delete()
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (delErr) {
    console.warn('[docs.deleteDocAction:delete]', { code: delErr.code, message: delErr.message })
    return { error: delErr.message || 'Could not delete doc.' }
  }

  revalidatePath('/app/docs')
  return { ok: true, id: docId }
}

// ==========================================================================
// v27.1.1.0 — log field mapping wizard server actions
// ==========================================================================

export type DocPdfField = {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList' | 'button' | 'signature' | 'unknown'
  /** For radio + dropdown + optionList — the available choices the form
   *  defines. The fill engine (v27.1.1.1) will need these to coerce a
   *  data-source value to a valid selection. */
  options?: string[]
}

export type ExtractFieldsResult =
  | {
      ok: true
      fields: DocPdfField[]
      formTemplateHash: string
      /** Fields with no AcroForm at all → flag so the wizard can show a
       *  helpful "this PDF isn't fillable" state instead of an empty list. */
      hasAcroForm: boolean
    }
  | { error: string }

export async function extractDocFieldsAction(docId: string): Promise<ExtractFieldsResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  const sb = await createClient()
  const { data: doc } = await sb
    .from('docs')
    .select('id, kind, file_path, file_mime, form_template_hash')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!doc) return { error: 'Doc not found.' }
  if (doc.kind !== 'log' && doc.kind !== 'waiver') {
    return { error: 'Field mapping is only available for log and waiver docs.' }
  }

  // Download the binary via the user-session client (RLS-gated by storage
  // policies). createSignedUrl + fetch would also work but `download` is
  // cleaner — the server already has the user's auth.
  const { data: blob, error: dlErr } = await sb.storage
    .from('bb-private')
    .download(doc.file_path)
  if (dlErr || !blob) {
    console.warn('[docs.extractDocFieldsAction:download]', { code: dlErr?.statusCode, message: dlErr?.message })
    return { error: 'Could not download the PDF.' }
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  const formTemplateHash = createHash('sha256').update(buf).digest('hex')

  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
  } catch (e: unknown) {
    return {
      error:
        'Could not parse this PDF. It may be corrupted or password-protected. Try the official version from your state agency.',
    }
  }

  // pdf-lib's getForm() always returns a form — fields[] is empty for
  // PDFs without an AcroForm. We surface that explicitly so the wizard
  // can show the right empty state.
  const form = pdf.getForm()
  const rawFields = form.getFields()

  const fields: DocPdfField[] = rawFields.map((f) => {
    const name = f.getName()
    const ctorName = f.constructor.name
    let type: DocPdfField['type'] = 'unknown'
    let options: string[] | undefined
    if (ctorName === 'PDFTextField') type = 'text'
    else if (ctorName === 'PDFCheckBox') type = 'checkbox'
    else if (ctorName === 'PDFRadioGroup') {
      type = 'radio'
      const rg = f as unknown as { getOptions: () => string[] }
      try {
        options = rg.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (ctorName === 'PDFDropdown') {
      type = 'dropdown'
      const dd = f as unknown as { getOptions: () => string[] }
      try {
        options = dd.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (ctorName === 'PDFOptionList') {
      type = 'optionList'
      const ol = f as unknown as { getOptions: () => string[] }
      try {
        options = ol.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (ctorName === 'PDFButton') type = 'button'
    else if (ctorName === 'PDFSignature') type = 'signature'
    return { name, type, options }
  })

  // Persist the hash if it changed (or was never set). Lets us key
  // future "your existing mappings still apply" UX off the hash even
  // though the wizard saves rows on doc_id directly.
  if (doc.form_template_hash !== formTemplateHash) {
    await sb
      .from('docs')
      .update({ form_template_hash: formTemplateHash })
      .eq('id', docId)
      .eq('guide_id', profile.id)
  }

  return {
    ok: true,
    fields,
    formTemplateHash,
    hasAcroForm: rawFields.length > 0,
  }
}

// --- saveDocMappingsAction -------------------------------------------------

export type MappingInput = {
  field_name: string
  /** Either a known data-source path, "static:<value>", or "skip". An empty
   *  string means "no mapping" and that row should be DELETED if it exists. */
  data_source_path: string
  /** v27.1.1.0.3c.1: manual slot override. 0 = auto-detect via field-name
   *  regex; 1+ = explicit hunter slot. Persisted to
   *  doc_field_mappings.hunter_slot. */
  hunter_slot?: number
}

export type SaveMappingsResult = { ok: true; mapping_status: string } | { error: string }

export async function saveDocMappingsAction(
  docId: string,
  mappings: MappingInput[]
): Promise<SaveMappingsResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }
  if (!Array.isArray(mappings)) return { error: 'Bad mappings payload.' }

  const sb = await createClient()
  const { data: doc } = await sb
    .from('docs')
    .select('id, kind')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!doc) return { error: 'Doc not found.' }
  if (doc.kind !== 'log' && doc.kind !== 'waiver') {
    return { error: 'Field mapping is only available for log and waiver docs.' }
  }

  // Split into upsert vs delete sets.
  const toUpsert: TablesInsert<'doc_field_mappings'>[] = []
  const toDelete: string[] = []
  for (const m of mappings) {
    const fieldName = m.field_name?.trim()
    if (!fieldName) continue
    const path = (m.data_source_path ?? '').trim()
    if (!path) {
      toDelete.push(fieldName)
      continue
    }
    // v27.1.1.0.1: bare picker sentinels (prefix only, no literal payload)
    // mean the guide opened a picker but didn't fill it in. Treat them as
    // no-mapping so unmapped/skip is the default and the wizard's "Save
    // draft" never persists junk.
    if (
      path === STATIC_TEXT_PREFIX ||
      path === STATIC_DATE_PREFIX ||
      path === STATIC_DATE_RANGE_PREFIX
    ) {
      toDelete.push(fieldName)
      continue
    }
    // Half-filled date range like "static_date_range:2026-09-15.." — the
    // wizard guards against this but server stays defensive.
    if (path.startsWith(STATIC_DATE_RANGE_PREFIX)) {
      const raw = path.slice(STATIC_DATE_RANGE_PREFIX.length)
      const [start, end] = raw.split('..')
      if (!start || !end) {
        toDelete.push(fieldName)
        continue
      }
    }
    // v27.1.1.0.3c.1: persist the manual slot override. Clamp to 0..99
    // (matches CHECK constraint on the column).
    const rawSlot = typeof m.hunter_slot === 'number' && Number.isFinite(m.hunter_slot)
      ? Math.floor(m.hunter_slot)
      : 0
    const hunterSlot = Math.max(0, Math.min(99, rawSlot))
    toUpsert.push({
      doc_id: docId,
      mapping_kind: 'field',
      field_name: fieldName,
      data_source_path: path,
      hunter_slot: hunterSlot,
    })
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await sb
      .from('doc_field_mappings')
      .delete()
      .eq('doc_id', docId)
      .eq('mapping_kind', 'field')
      .in('field_name', toDelete)
    if (delErr) {
      console.warn('[docs.saveDocMappingsAction:delete]', { code: delErr.code, message: delErr.message })
      return { error: delErr.message || 'Could not clear mappings.' }
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await sb
      .from('doc_field_mappings')
      .upsert(toUpsert, { onConflict: 'doc_id,field_name,mapping_kind' })
    if (upErr) {
      console.warn('[docs.saveDocMappingsAction:upsert]', { code: upErr.code, message: upErr.message })
      return { error: upErr.message || 'Could not save mappings.' }
    }
  }

  // Recompute mapping_status. Coarse rule:
  //   no mapped field rows  → 'unmapped'
  //   some rows but not all → 'partial' (we don't know "all" without the
  //                          form's field count; treat any saved row as
  //                          'partial' until the wizard explicitly marks
  //                          complete via the dedicated "All set" path
  //                          v27.1.1.1 surfaces. For now we go to
  //                          'partial' and let the guide flip to
  //                          'complete' from the wizard footer.)
  const { count } = await sb
    .from('doc_field_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('doc_id', docId)
    .eq('mapping_kind', 'field')

  const newStatus =
    !count || count === 0
      ? 'unmapped'
      : 'partial'

  await sb
    .from('docs')
    .update({ mapping_status: newStatus })
    .eq('id', docId)
    .eq('guide_id', profile.id)

  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
  revalidatePath(`/app/docs/${docId}/mapping`)
  return { ok: true, mapping_status: newStatus }
}

// --- markMappingCompleteAction --------------------------------------------
// Lets the guide explicitly flag a doc as complete from the wizard. Distinct
// from saveDocMappingsAction so the wizard can offer "Save draft" vs
// "Save + mark complete" without inferring intent from row counts.

export type MarkMappingResult = { ok: true } | { error: string }

export async function markMappingCompleteAction(
  docId: string,
  complete: boolean
): Promise<MarkMappingResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  const sb = await createClient()
  const newStatus = complete ? 'complete' : 'partial'

  // v27.1.1.0.1: zero-row "complete" is a valid state. A guide may
  // legitimately want to mark a doc complete with every PDF field
  // intentionally unmapped (= skip). Trust the guide; no row gating.

  const { error } = await sb
    .from('docs')
    .update({ mapping_status: newStatus })
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (error) {
    console.warn('[docs.markMappingCompleteAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not update status.' }
  }

  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
  revalidatePath(`/app/docs/${docId}/mapping`)
  return { ok: true }
}
