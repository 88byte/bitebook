'use server'

// v27.1.0 — Documents Module server actions.
// Library: create / update / archive / restore / delete-when-unattached.
// Mapping wizards + trip attachment + per-hunter actions land in v27.1.1+.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from './auth'
import type { Database, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

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
