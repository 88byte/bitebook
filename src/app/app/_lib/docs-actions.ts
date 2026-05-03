'use server'

// v27.1.0 — Documents Module server actions (library CRUD).
// v27.1.1.0 — log mapping wizard server actions (extract + save).
// Auto-fill engine lands in v27.1.1.1.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from './auth'
import type { Database, TablesInsert, TablesUpdate } from '@/lib/supabase/types'
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
} from 'pdf-lib'
import {
  SKIP_VALUE,
  STATIC_TEXT_PREFIX,
  STATIC_DATE_PREFIX,
  STATIC_DATE_RANGE_PREFIX,
  DATA_SOURCES,
  type DataSourceOption,
} from './doc-data-sources'
import { parseFieldName, detectImplicitSlot1 } from './harvest-log-fill-types'
import Anthropic from '@anthropic-ai/sdk'

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

  // v27.1.1.0.3d.2: auto-fire AI suggestions for log uploads. Runs after
  // the response is sent so upload UX isn't blocked. ANTHROPIC_API_KEY
  // missing → server-side log + no row inserted; manual button stays as
  // recovery path.
  if (kind === 'log') {
    const newDocId = inserted.id
    after(async () => {
      try {
        const res = await suggestMappingsAction(newDocId)
        if ('error' in res) {
          console.warn('[docs.createDocAction:auto-suggest]', { docId: newDocId, error: res.error })
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[docs.createDocAction:auto-suggest:throw]', { docId: newDocId, msg })
      }
    })
  }

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
// v27.1.1.0.3e.4 — Bulk archive + delete on /app/docs library
// ==========================================================================
//
// Library page lets the guide select multiple docs in their own library and
// either archive or hard-delete them in one shot. Templates section is
// excluded by id-filter at the action level (we only operate on docs the
// guide owns where guide_id === profile.id; Bite Book templates owned by
// the admin pass through a different RLS policy and are excluded here even
// if a row id is included in the request).
//
// Behavior matches the single-row actions:
//   - bulkArchiveDocsAction: sets archived_at on every targeted row.
//   - bulkDeleteDocsAction: requires every targeted row to be archived AND
//     have zero trip_docs references. Refuses any active or attached doc
//     and reports the full reason set so the modal can show the user what
//     to clean up.

export type BulkDocsActionResult =
  | { ok: true; processed: number; skipped: { id: string; reason: string }[] }
  | { error: string }

export async function bulkArchiveDocsAction(docIds: string[]): Promise<BulkDocsActionResult> {
  const { profile } = await requireGuide()
  const ids = (docIds ?? []).filter((s) => typeof s === 'string' && s.length > 0)
  if (ids.length === 0) return { error: 'No docs selected.' }

  const sb = await createClient()
  const { error } = await sb
    .from('docs')
    .update({ archived_at: new Date().toISOString() })
    .in('id', ids)
    .eq('guide_id', profile.id)
    .is('archived_at', null)
  if (error) {
    console.warn('[docs.bulkArchiveDocsAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not archive docs.' }
  }
  revalidatePath('/app/docs')
  return { ok: true, processed: ids.length, skipped: [] }
}

// v27.1.1.0.3e.8: bulk restore — symmetric inverse of bulkArchiveDocsAction.
// Used by the action bar in the 'Show archived' view: when all selected
// rows are archived the bar swaps Archive → Restore.
export async function bulkRestoreDocsAction(docIds: string[]): Promise<BulkDocsActionResult> {
  const { profile } = await requireGuide()
  const ids = (docIds ?? []).filter((s) => typeof s === 'string' && s.length > 0)
  if (ids.length === 0) return { error: 'No docs selected.' }

  const sb = await createClient()
  const { error } = await sb
    .from('docs')
    .update({ archived_at: null })
    .in('id', ids)
    .eq('guide_id', profile.id)
    .not('archived_at', 'is', null)
  if (error) {
    console.warn('[docs.bulkRestoreDocsAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not restore docs.' }
  }
  revalidatePath('/app/docs')
  return { ok: true, processed: ids.length, skipped: [] }
}

export async function bulkDeleteDocsAction(docIds: string[]): Promise<BulkDocsActionResult> {
  const { profile } = await requireGuide()
  const ids = (docIds ?? []).filter((s) => typeof s === 'string' && s.length > 0)
  if (ids.length === 0) return { error: 'No docs selected.' }

  const sb = await createClient()

  // Pull the targeted rows (guide_id-scoped) so we can vet each one.
  const { data: rows, error: fetchErr } = await sb
    .from('docs')
    .select('id, archived_at, file_path, label')
    .in('id', ids)
    .eq('guide_id', profile.id)
  if (fetchErr) {
    console.warn('[docs.bulkDeleteDocsAction:fetch]', { code: fetchErr.code, message: fetchErr.message })
    return { error: 'Could not look up selected docs.' }
  }
  const ownedRows = rows ?? []

  // v27.1.1.0.3e.8: dropped the trip-attached pre-check entirely. The
  // gate was originally a "don't accidentally orphan a hunter's trip
  // attachment" guard, but in practice it was silently blocking real
  // deletes (e.g. legacy auto-generated PDFs from before v3e.3 still
  // had trip_docs rows even after archive). The trip_docs FK is ON
  // DELETE CASCADE — the row delete already cleans up trip attachments
  // atomically. trip_generated_logs.source_doc_id is ON DELETE SET NULL,
  // so the generated-PDF history stays intact with a null pointer back
  // to the original template.
  const skipped: { id: string; reason: string }[] = []
  const toDelete: { id: string; file_path: string | null }[] = []
  const ownedIds = new Set(ownedRows.map((r) => r.id))
  for (const id of ids) {
    if (!ownedIds.has(id)) {
      skipped.push({ id, reason: 'Not found.' })
    }
  }
  // v27.1.1.0.3e.5: bulk delete auto-archives any active rows in the
  // selection before deleting, so the user doesn't have to do a
  // separate archive pass.
  const toAutoArchive: string[] = []
  for (const row of ownedRows) {
    if (!row.archived_at) {
      toAutoArchive.push(row.id)
    }
    toDelete.push({ id: row.id, file_path: row.file_path })
  }

  if (toAutoArchive.length > 0) {
    const { error: archErr } = await sb
      .from('docs')
      .update({ archived_at: new Date().toISOString() })
      .in('id', toAutoArchive)
      .eq('guide_id', profile.id)
    if (archErr) {
      console.warn('[docs.bulkDeleteDocsAction:auto_archive]', { code: archErr.code, message: archErr.message })
      return { error: archErr.message || 'Could not archive docs before delete.' }
    }
  }

  if (toDelete.length === 0) {
    return { ok: true, processed: 0, skipped }
  }

  // Best-effort storage cleanup — fire all removes in parallel; we don't
  // block the row-delete on storage success since storage-only orphans
  // are recoverable.
  // v27.1.1.0.3e.7: wrap in try/catch defensively. Storage `remove` can
  // throw on a malformed path or network blip; an unhandled throw here
  // would have killed the entire action and the row delete would never
  // run — that was the silent failure mode the user reported.
  try {
    await Promise.all(
      toDelete
        .filter((d): d is { id: string; file_path: string } => !!d.file_path)
        .map((d) =>
          sb.storage.from('bb-private').remove([d.file_path]).catch((e) => {
            console.warn('[docs.bulkDeleteDocsAction:storage]', {
              file_path: d.file_path,
              error: e instanceof Error ? e.message : String(e),
            })
            return null
          })
        )
    )
  } catch (e) {
    console.warn('[docs.bulkDeleteDocsAction:storage_top]', {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const { error: delErr } = await sb
    .from('docs')
    .delete()
    .in('id', toDelete.map((d) => d.id))
    .eq('guide_id', profile.id)
  if (delErr) {
    console.warn('[docs.bulkDeleteDocsAction:delete]', { code: delErr.code, message: delErr.message })
    return { error: delErr.message || 'Could not delete docs.' }
  }

  revalidatePath('/app/docs')
  return { ok: true, processed: toDelete.length, skipped }
}

// ==========================================================================
// v27.1.1.0.3e — Bite Book templates: admin-only is_template toggle
// ==========================================================================
//
// Flips docs.is_template on a doc the admin owns. RLS policy
// `docs_template_select` is what lets every other authenticated user read
// the row once the flag is on; this action is just the write path. Gated
// on email match against the hardcoded admin address — kept out of any
// env var so a misconfigured Vercel deploy can't widen the gate.

const TEMPLATE_ADMIN_EMAIL = 'flaviod022@gmail.com'

export async function setDocTemplateFlagAction(
  docId: string,
  makeTemplate: boolean
): Promise<DocActionResult> {
  const { user, profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  if ((user.email ?? '').toLowerCase() !== TEMPLATE_ADMIN_EMAIL) {
    return { error: 'Only the Bite Book admin can manage templates.' }
  }

  const sb = await createClient()

  // Verify the doc belongs to the calling guide. We don't trust the
  // client-side gate alone — the RLS policy does too, but defending in
  // depth keeps a stray write off someone else's row even if a future
  // policy regression slips through.
  const { data: cur } = await sb
    .from('docs')
    .select('id, guide_id')
    .eq('id', docId)
    .maybeSingle()
  if (!cur) return { error: 'Doc not found.' }
  if (cur.guide_id !== profile.id) {
    return { error: 'You can only flag your own docs as templates.' }
  }

  const { error } = await sb
    .from('docs')
    .update({ is_template: makeTemplate })
    .eq('id', docId)
    .eq('guide_id', profile.id)
  if (error) {
    console.warn('[docs.setDocTemplateFlagAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not update template flag.' }
  }

  revalidatePath('/app/docs')
  revalidatePath(`/app/docs/${docId}`)
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

  // v27.1.1.0.3c.4: switched from `f.constructor.name === 'PDFCheckBox'`
  // to `instanceof PDFCheckBox`. Bundling under Vercel/Turbopack mangled
  // pdf-lib's class names in production builds, so checkboxes were
  // showing up as type='unknown' and the wizard was falling back to
  // string-only source filtering. instanceof relies on the prototype
  // chain rather than the JS class-name string and survives bundling.
  // We keep a constructor.name fallback as defense-in-depth in case a
  // duplicate pdf-lib import lands on a different prototype across
  // server/client splits.
  const fields: DocPdfField[] = rawFields.map((f) => {
    const name = f.getName()
    const ctorName = f.constructor?.name ?? ''
    let type: DocPdfField['type'] = 'unknown'
    let options: string[] | undefined
    if (f instanceof PDFTextField || ctorName === 'PDFTextField') type = 'text'
    else if (f instanceof PDFCheckBox || ctorName === 'PDFCheckBox') type = 'checkbox'
    else if (f instanceof PDFRadioGroup || ctorName === 'PDFRadioGroup') {
      type = 'radio'
      const rg = f as unknown as { getOptions: () => string[] }
      try {
        options = rg.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (f instanceof PDFDropdown || ctorName === 'PDFDropdown') {
      type = 'dropdown'
      const dd = f as unknown as { getOptions: () => string[] }
      try {
        options = dd.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (f instanceof PDFOptionList || ctorName === 'PDFOptionList') {
      type = 'optionList'
      const ol = f as unknown as { getOptions: () => string[] }
      try {
        options = ol.getOptions?.()
      } catch {
        /* noop */
      }
    } else if (f instanceof PDFButton || ctorName === 'PDFButton') type = 'button'
    else if (f instanceof PDFSignature || ctorName === 'PDFSignature') type = 'signature'
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
   *  regex; 1+ = explicit hunter slot. */
  hunter_slot?: number
  /** v27.1.1.0.3c.2: when true, this slot's mapping is decoupled from
   *  Hunter 1 auto-mirroring and stays exactly what the guide picked. */
  is_override?: boolean
  /** v27.1.1.0.3e.5: optional secondary source. Engine evaluates
   *  data_source_path first; if it returns null/empty, evaluates this
   *  fallback. Lets a single PDF field accept either-or sources (e.g.
   *  CDFW "TAG / REPORT CARD"). Same value space as data_source_path —
   *  pickerable path, "static:..." string, or "skip"/empty (no fallback). */
  fallback_path?: string | null
}

export type SaveMappingsResult =
  | { ok: true; mapping_status: string; mirrored_count: number }
  | { error: string }

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

  // First pass: parse incoming mappings into a per-field staging map. We
  // keep both the path AND the slot/override so the v27.1.1.0.3c.2 mirror
  // pass below can read every field's effective slot to identify
  // candidates.
  type Staged = {
    path: string  // empty string = pending delete
    fallbackPath: string | null  // v27.1.1.0.3e.5
    hunterSlot: number
    isOverride: boolean
    explicit: boolean  // user touched this field this save
  }
  // Local sanitizer — same picker-sentinel + half-filled-range guards
  // applied to both primary and fallback paths.
  function sanitizePath(raw: string): string {
    let p = raw.trim()
    if (
      p === STATIC_TEXT_PREFIX ||
      p === STATIC_DATE_PREFIX ||
      p === STATIC_DATE_RANGE_PREFIX
    ) {
      p = ''
    }
    if (p.startsWith(STATIC_DATE_RANGE_PREFIX)) {
      const rest = p.slice(STATIC_DATE_RANGE_PREFIX.length)
      const [start, end] = rest.split('..')
      if (!start || !end) p = ''
    }
    return p
  }
  const staged = new Map<string, Staged>()
  for (const m of mappings) {
    const fieldName = m.field_name?.trim()
    if (!fieldName) continue
    const path = sanitizePath(m.data_source_path ?? '')
    // v27.1.1.0.3e.5: fallback is optional; null/'' means no fallback.
    // A primary that comes through as empty also clears the fallback —
    // saving an unmapped row drops both.
    const fbRaw = sanitizePath((m.fallback_path ?? '') as string)
    const fallbackPath = path && fbRaw && fbRaw !== path ? fbRaw : null
    const rawSlot = typeof m.hunter_slot === 'number' && Number.isFinite(m.hunter_slot)
      ? Math.floor(m.hunter_slot)
      : 0
    const hunterSlot = Math.max(0, Math.min(99, rawSlot))
    const isOverride = m.is_override === true
    staged.set(fieldName, { path, fallbackPath, hunterSlot, isOverride, explicit: true })
  }

  // v27.1.1.0.3c.2: auto-mirror Hunter 1 → slots 2..N.
  // For each slot-1 field with a non-empty path, compute the base name
  // (parseFieldName strips the slot pattern). For every other staged
  // field whose effective slot is 2..N AND whose base name matches AND
  // whose is_override is false, override the path with the slot-1 path.
  // is_override=true preserves the user's explicit choice for that slot.
  const slot1ByBase = new Map<string, string>()
  for (const [fieldName, s] of staged) {
    if (!s.path) continue
    const parsed = parseFieldName(fieldName)
    const effSlot = s.hunterSlot > 0 ? s.hunterSlot : parsed.slot
    if (effSlot === 1) {
      slot1ByBase.set(parsed.base, s.path)
    }
  }
  let mirroredCount = 0
  for (const [fieldName, s] of staged) {
    if (s.isOverride) continue
    const parsed = parseFieldName(fieldName)
    const effSlot = s.hunterSlot > 0 ? s.hunterSlot : parsed.slot
    if (effSlot < 2) continue
    const mirror = slot1ByBase.get(parsed.base)
    if (!mirror) continue
    if (s.path !== mirror) {
      s.path = mirror
      mirroredCount += 1
    }
  }

  // Now translate staged → upsert/delete.
  const toUpsert: TablesInsert<'doc_field_mappings'>[] = []
  const toDelete: string[] = []
  for (const [fieldName, s] of staged) {
    if (!s.path) {
      toDelete.push(fieldName)
      continue
    }
    toUpsert.push({
      doc_id: docId,
      mapping_kind: 'field',
      field_name: fieldName,
      data_source_path: s.path,
      // v27.1.1.0.3e.5: fallback_path mirrors the auto-mirror semantics
      // implicitly — the mirror loop above only touches `path`, so a
      // slot-2..N field that gets mirrored from slot 1 inherits slot 1's
      // primary but keeps its own fallback (typically null). That's the
      // right call: fallbacks are PDF-shape-driven, not hunter-shape-driven.
      fallback_path: s.fallbackPath,
      hunter_slot: s.hunterSlot,
      is_override: s.isOverride,
      // v27.1.1.0.3d: clearing the AI flag on every save — once the
      // guide has touched a row (confirm or edit), it's no longer
      // a pending suggestion. The wizard surfaces the ✨ AI badge
      // only on rows where this is still true.
      is_ai_suggested: false,
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
  return { ok: true, mapping_status: newStatus, mirrored_count: mirroredCount }
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

// ==========================================================================
// v27.1.1.0.3d — AI-suggested mappings via Claude Haiku 4.5
// ==========================================================================
//
// Calls the Anthropic API with the PDF's discovered fields + the data-source
// catalog and asks Claude to propose a data_source_path + hunter_slot for
// each field. Validated suggestions are upserted into doc_field_mappings
// with is_ai_suggested=true so the wizard can render the ✨ AI badge and
// pre-fill the dropdown. Saving any mapping (confirm or edit) clears the
// flag — see saveDocMappingsAction's upsert above.
//
// Trigger surface: manual button in the wizard ("Auto-suggest mappings"),
// and best-effort post-upload for kind='log' (UPLOAD path defers to a
// future hook — current entry point is the wizard button).
//
// Cost guardrail: Haiku 4.5 is ~$1/Mtok in / $5/Mtok out — a typical
// 80-field PDF prompt runs ~5K input + 1K output tokens, ~$0.01 per call.
// Idempotent: re-running just refreshes suggestions for fields the guide
// hasn't yet confirmed.

export type SuggestMappingsResult =
  | { ok: true; suggested: number; skipped: number; rejected: number }
  | { error: string; needs_setup?: boolean }

export async function suggestMappingsAction(
  docId: string
): Promise<SuggestMappingsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      error: 'AI suggestions need an Anthropic API key. Ask the admin to set ANTHROPIC_API_KEY on Vercel.',
      needs_setup: true,
    }
  }
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  const sb = await createClient()
  const { data: doc } = await sb
    .from('docs')
    .select('id, kind, file_path')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!doc) return { error: 'Doc not found.' }
  if (doc.kind !== 'log') {
    return { error: 'AI suggestions are only available for log docs right now.' }
  }

  // Reuse extractDocFieldsAction's discovery (downloads + parses the PDF
  // via pdf-lib, returns typed fields). Calling the public action keeps
  // the field-type detection logic in one place.
  const ext = await extractDocFieldsAction(docId)
  if ('error' in ext) return { error: ext.error }
  if (!ext.hasAcroForm || ext.fields.length === 0) {
    return { error: 'PDF has no fillable fields to suggest mappings for.' }
  }

  // v27.1.1.0.3d.2: also download the raw PDF binary so we can pass it to
  // Claude as a `document` content block. Vision context (page layout,
  // section headings, label proximity) lifts mapping accuracy on state
  // forms whose field names alone are ambiguous (e.g. CDFW 992-B's
  // 5-hunter columns or hunter×species 2D species rows).
  let pdfBase64: string | null = null
  try {
    const { data: blob } = await sb.storage.from('bb-private').download(doc.file_path)
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer())
      pdfBase64 = buf.toString('base64')
    }
  } catch (e: unknown) {
    // Vision is additive — if download fails we still call Claude with
    // text-only prompt and log a warning.
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[docs.suggestMappingsAction:pdf-download]', { msg })
  }

  // Build a compact catalog payload for the LLM. Drop verbose fields and
  // the static-text/static-date sentinels — the LLM should map to a real
  // path or 'skip'. Sentinels are guide-only intents.
  const catalogForLLM = DATA_SOURCES.filter((s) => s.category !== 'special').map(
    (s: DataSourceOption) => ({
      path: s.value,
      label: s.label,
      valueType: s.valueType,
      perRow: s.perRow === true,
      category: s.category,
    })
  )

  // Pre-compute slot hints from the deterministic regex + implicit-1
  // detection. Pass to the LLM as a starting point so it doesn't have to
  // re-derive them; LLM may override if it sees a better signal.
  const fieldNames = ext.fields.map((f) => f.name)
  const implicit1 = detectImplicitSlot1(fieldNames)
  const fieldsForLLM = ext.fields.map((f) => {
    const parsed = parseFieldName(f.name)
    const slotHint = parsed.slot > 0 ? parsed.slot : implicit1.has(f.name) ? 1 : 0
    return {
      name: f.name,
      type: f.type,
      slotHint,
      ...(f.options && f.options.length > 0 ? { options: f.options.slice(0, 8) } : {}),
    }
  })

  const systemPrompt = `You map PDF form-field names to data-source paths for a hunting/fishing guide log auto-fill tool.

You are given:
1. The PDF itself as a document (visual context — labels, section headings, hunter columns, where each box sits on the page).
2. A list of form-field internal names (with detected type + a slotHint).
3. A catalog of data-source paths the auto-fill engine knows how to resolve.

Use the PDF's layout to disambiguate. Section headings like "Hunter 1 / Hunter 2", repeating columns, or labels printed next to each box almost always tell you the right slot AND the right source — the internal field name often doesn't.

Call the submit_mappings tool exactly once with one entry per form-field, in the order given.

Rules:
- "suggested_path" must EXACTLY match a catalog "path" string OR be "skip" (no fit).
- "hunter_slot" 0 = trip-level (not per-hunter). 1..5 = which hunter column the box belongs to (read off the PDF page).
- For checkbox fields, choose a path with valueType="boolean" or "skip".
- For text fields, choose valueType="string" or "skip".
- For per-hunter fields (catalog perRow=true), set hunter_slot >= 1.
- For trip-level fields (catalog perRow=false), set hunter_slot=0.
- slotHint is a regex-derived starting point — override it freely when the PDF page shows the box belongs to a different slot.
- "confidence":"low" when the box is ambiguous or no catalog path fits.

DOCUMENT-TYPE DISAMBIGUATION (critical — common AI mistake):
- "Tag Report Card" / "Harvest Report Card" / "Bear Tag Report" / "Deer Tag Report" / any "Report Card" field on a state log → MUST map to "hunter_harvest_report_card.identifier" (number) or its sibling fields. NEVER to "hunter_license.*" — a hunter's report card is a separate physical document from their hunting license.
- "License" / "License #" / "License Number" / "License DOC ID" → "hunter_license.identifier" (or "guide_license.identifier" if the field sits in a guide section).
- "Stamp" / "Federal Duck Stamp" / "Migratory Bird Stamp" → "hunter_stamp.identifier" (number) or "hunter_stamp.jurisdiction"/"state"/"year".
- "Tag" without "Report Card" (e.g. "Tag #", "Tag Number") → "wallet_consumed.identifier" (the harvest tag the hunter punched).

SIGNATURE FIELDS (always skip):
- "Date Signed" / "Date of Signature" / "Signature Date" / any signature-date placeholder → MUST map to "skip". These are filled when the document is signed via e-signature, NEVER from harvest_log.log_date or wallet.valid_to or any other source.
- "Signature" / "Sign Here" / "Initials" / "Hunter Signature" / "Guide Signature" / signature-type form fields → MUST map to "skip". Signature-block placement ships in v27.2 with the e-signature engine; auto-fill leaves these alone.

EITHER-OR FIELDS (use fallback_path):
- When a label says "TAG / REPORT CARD", "TAG OR REPORT CARD", "License or Permit", "Phone or Email", "(if applicable)", or otherwise indicates EITHER of two sources is acceptable, set BOTH suggested_path AND fallback_path.
- The engine evaluates suggested_path first; if it's empty (no value on the entry), it falls through to fallback_path.
- Pick the more common case as the primary. For "TAG / REPORT CARD" on a CDFW form, prefer "wallet_consumed.identifier" (the punched tag) as primary and "hunter_harvest_report_card.identifier" as fallback.
- For ordinary single-source fields, omit fallback_path (or set to empty string). Only use it when the label genuinely accepts either-or.

When the field name is ambiguous, prefer "skip" over forcing a wrong category match.`

  const userText = `Form-field list (${fieldsForLLM.length} total):
${JSON.stringify(fieldsForLLM)}

Data source catalog (${catalogForLLM.length} options):
${JSON.stringify(catalogForLLM)}

Return the JSON array now.`

  // v27.1.1.0.3d.2: assemble the message content. PDF document block
  // first (Claude reads it before the question), then the form-field
  // list + catalog as text. Drop to text-only if PDF download failed.
  type DocumentBlock = {
    type: 'document'
    source: { type: 'base64'; media_type: 'application/pdf'; data: string }
  }
  type TextBlock = { type: 'text'; text: string }
  const userContent: Array<DocumentBlock | TextBlock> = []
  if (pdfBase64) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    })
  }
  userContent.push({ type: 'text', text: userText })

  let parsed: Array<{
    field_name: string
    path: string
    fallback_path: string
    hunter_slot: number
    confidence: string
  }> = []
  try {
    const client = new Anthropic({ apiKey })
    // v27.1.1.0.3d.2.2: switched from assistant-prefill (not supported
    // on Sonnet 4.6 — "This model does not support assistant message
    // prefill") to Anthropic's tool-use mechanism for structured
    // output. We define a `submit_mappings` tool whose `input_schema`
    // exactly describes what we want back. Claude is forced (via
    // tool_choice) to call the tool, returning a typed object instead
    // of free-form text. No more JSON parsing, no more preamble bugs.
    const submitMappingsTool = {
      name: 'submit_mappings',
      description:
        'Return the suggested data-source mapping for every PDF form field. Call this exactly once with one entry per field, in the order the fields were given.',
      input_schema: {
        type: 'object' as const,
        properties: {
          mappings: {
            type: 'array',
            description: 'One entry per PDF form field, in the order given.',
            items: {
              type: 'object',
              properties: {
                field_name: {
                  type: 'string',
                  description: 'The exact internal name of the PDF form field.',
                },
                suggested_path: {
                  type: 'string',
                  description:
                    'A catalog "path" string that EXACTLY matches one of the data-source options, or the literal string "skip" if no source fits.',
                },
                fallback_path: {
                  type: 'string',
                  description:
                    'OPTIONAL secondary catalog path. Use ONLY when the PDF field label suggests an either-or value (e.g. "TAG / REPORT CARD", "License or Permit", "Phone or Email", "(if applicable)"). Set this to a different catalog path. The fill engine evaluates suggested_path first; if it returns empty, the engine falls through to fallback_path. Omit (or set to empty string) for normal single-source fields.',
                },
                hunter_slot: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 5,
                  description:
                    '0 = trip-level (not per-hunter). 1..5 = which hunter column the field belongs to (read off the PDF page).',
                },
                confidence: {
                  type: 'string',
                  enum: ['high', 'medium', 'low'],
                  description:
                    '"low" when the field is ambiguous or no catalog path fits well.',
                },
              },
              required: ['field_name', 'suggested_path', 'hunter_slot', 'confidence'],
            },
          },
        },
        required: ['mappings'],
      },
    }
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      tools: [submitMappingsTool],
      tool_choice: { type: 'tool', name: 'submit_mappings' },
      messages: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: userContent as any },
      ],
    })
    const toolUse = resp.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'submit_mappings') {
      console.warn('[docs.suggestMappingsAction:no-tool-use]', {
        stopReason: resp.stop_reason,
        contentTypes: resp.content.map((c) => c.type),
      })
      return { error: 'AI did not use the submit_mappings tool. Try again, or map the fields manually.' }
    }
    // input is already a typed object — no JSON.parse needed.
    const input = toolUse.input as { mappings?: unknown }
    if (!input || !Array.isArray(input.mappings)) {
      return { error: 'AI returned no mappings array.' }
    }
    // Normalize to the shape the rest of the action expects (path = suggested_path).
    parsed = (input.mappings as Array<{
      field_name?: unknown
      suggested_path?: unknown
      fallback_path?: unknown
      hunter_slot?: unknown
      confidence?: unknown
    }>)
      .map((m) => ({
        field_name: typeof m.field_name === 'string' ? m.field_name : '',
        path: typeof m.suggested_path === 'string' ? m.suggested_path : '',
        fallback_path: typeof m.fallback_path === 'string' ? m.fallback_path : '',
        hunter_slot: typeof m.hunter_slot === 'number' ? m.hunter_slot : 0,
        confidence: typeof m.confidence === 'string' ? m.confidence : 'low',
      }))
      .filter((m) => m.field_name)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[docs.suggestMappingsAction:anthropic]', { msg })
    return { error: `AI request failed: ${msg.slice(0, 200)}` }
  }

  // Validate suggestions against the real catalog. Drop any path the LLM
  // hallucinated. Map case-mismatched names back to their canonical form.
  const validPaths = new Set(catalogForLLM.map((s) => s.path))
  const fieldByName = new Map(ext.fields.map((f) => [f.name, f]))
  type Suggestion = {
    field_name: string
    data_source_path: string
    fallback_path: string | null
    hunter_slot: number
  }
  const accepted: Suggestion[] = []
  let rejected = 0
  let skipped = 0
  for (const s of parsed) {
    if (!s || typeof s !== 'object') { rejected++; continue }
    const f = fieldByName.get(s.field_name)
    if (!f) { rejected++; continue }
    const slot = Math.max(0, Math.min(5, Math.floor(Number(s.hunter_slot) || 0)))
    if (s.path === 'skip' || !s.path) { skipped++; continue }
    if (!validPaths.has(s.path)) { rejected++; continue }
    // v27.1.1.0.3e.5: validate optional fallback_path the same way —
    // must be a known catalog path AND distinct from the primary.
    let fallback: string | null = null
    if (s.fallback_path && s.fallback_path !== 'skip' && s.fallback_path !== s.path) {
      if (validPaths.has(s.fallback_path)) {
        fallback = s.fallback_path
      }
    }
    accepted.push({
      field_name: s.field_name,
      data_source_path: s.path,
      fallback_path: fallback,
      hunter_slot: slot,
    })
  }

  if (accepted.length === 0) {
    return { ok: true, suggested: 0, skipped, rejected }
  }

  // Only insert suggestions for fields the guide hasn't already mapped
  // (data_source_path IS NULL or row missing). We don't want to clobber
  // a confirmed mapping with an AI guess.
  const { data: existing } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, is_ai_suggested')
    .eq('doc_id', docId)
    .eq('mapping_kind', 'field')
  const existingByName = new Map<string, { path: string | null; isAi: boolean }>()
  for (const r of existing ?? []) {
    if (!r.field_name) continue
    existingByName.set(r.field_name, {
      path: r.data_source_path,
      isAi: r.is_ai_suggested === true,
    })
  }

  const toUpsert: TablesInsert<'doc_field_mappings'>[] = []
  for (const s of accepted) {
    const exist = existingByName.get(s.field_name)
    // Allow overwrite if no row, no path saved, OR row was a previous
    // AI suggestion (re-running refreshes).
    if (exist && exist.path && !exist.isAi) continue
    toUpsert.push({
      doc_id: docId,
      mapping_kind: 'field',
      field_name: s.field_name,
      data_source_path: s.data_source_path,
      // v27.1.1.0.3e.5: AI-supplied either-or fallback path lands here.
      // null when the model didn't return one or it failed validation.
      fallback_path: s.fallback_path,
      hunter_slot: s.hunter_slot,
      is_override: false,
      is_ai_suggested: true,
      // v27.1.1.0.3d.2.8: remember the AI's recommendation alongside the
      // active path so the wizard can offer a one-tap restore after a
      // manual edit. ai_suggested_path is preserved on guide saves.
      ai_suggested_path: s.data_source_path,
      ai_suggested_slot: s.hunter_slot,
    })
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await sb
      .from('doc_field_mappings')
      .upsert(toUpsert, { onConflict: 'doc_id,mapping_kind,field_name' })
    if (upErr) {
      console.warn('[docs.suggestMappingsAction:upsert]', { code: upErr.code, message: upErr.message })
      return { error: upErr.message || 'Could not save suggestions.' }
    }
    // Promote doc out of 'unmapped' into 'partial' so the docs library
    // shows progress.
    await sb
      .from('docs')
      .update({ mapping_status: 'partial' })
      .eq('id', docId)
      .eq('guide_id', profile.id)
      .eq('mapping_status', 'unmapped')
  }

  revalidatePath(`/app/docs/${docId}/mapping`)
  return { ok: true, suggested: toUpsert.length, skipped, rejected }
}
