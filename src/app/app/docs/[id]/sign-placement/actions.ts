'use server'

// v27.2.0.3 — drag-place signature wizard server actions.
//
// Persists fraction-coord rows to doc_field_mappings with
// mapping_kind='signature' + signature_role='hunter'|'guide'. Each
// placement row carries placement_coords jsonb shaped { x, y, w, h,
// page } where x/y/w/h are fractions [0..1] of the page in CANVAS
// coord space (origin top-left) and page is 1-indexed. The signing
// engine flips Y to PDF coords at sign time.
//
// Field name on these rows is a placeholder __sig_{role}_{idx} since
// field_name is NOT NULL but unused for drag-place rows (the engine
// keys placement off mapping_kind='signature' + signature_role +
// placement_coords, never field_name). Mapping-driven rows (where
// data_source_path='e_signature.{role}') keep their real field_name.
//
// Save semantics: replace-only the drag-place rows for this doc
// (mapping_kind='signature' AND placement_coords IS NOT NULL). We
// leave AcroForm-mapped signature rows (data_source_path matching
// e_signature.*) untouched so the wizard doesn't blow away the
// guide's mapping wizard work.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from '../../../_lib/auth'

type SignerRole = 'hunter' | 'guide'

type WizardPlacement = {
  role: SignerRole
  page: number
  x: number
  y: number
  w: number
  h: number
}

export type SavePlacementsResult =
  | { ok: true; count: number }
  | { error: string }

export async function savePlacementsAction(
  docId: string,
  placements: WizardPlacement[]
): Promise<SavePlacementsResult> {
  const { profile } = await requireGuide()
  if (!docId) return { error: 'Missing doc id.' }

  const sb = await createClient()

  // Verify the guide owns the doc. RLS would catch a cross-owner
  // write but we want a clean error message.
  const { data: doc, error: docErr } = await sb
    .from('docs')
    .select('id, guide_id')
    .eq('id', docId)
    .maybeSingle()
  if (docErr || !doc) return { error: docErr?.message || 'Doc not found.' }
  if (doc.guide_id !== profile.id) {
    return { error: 'Only the doc owner can place signatures.' }
  }

  // Validate + sanitize placements.
  const sanitized: WizardPlacement[] = []
  for (const p of placements) {
    if (p.role !== 'hunter' && p.role !== 'guide') continue
    if (
      typeof p.page !== 'number' ||
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      typeof p.w !== 'number' ||
      typeof p.h !== 'number'
    ) continue
    sanitized.push({
      role: p.role,
      page: Math.max(1, Math.floor(p.page)),
      x: Math.max(0, Math.min(1, p.x)),
      y: Math.max(0, Math.min(1, p.y)),
      w: Math.max(0.01, Math.min(1, p.w)),
      h: Math.max(0.01, Math.min(1, p.h)),
    })
  }

  // Replace existing drag-place rows for this doc. Mapping-driven
  // signature rows (placement_coords IS NULL) stay intact.
  const { data: existing } = await sb
    .from('doc_field_mappings')
    .select('id, placement_coords')
    .eq('doc_id', docId)
    .eq('mapping_kind', 'signature')
  const idsToDelete = ((existing ?? []) as Array<{ id: string; placement_coords: unknown }>)
    .filter((r) => r.placement_coords !== null && r.placement_coords !== undefined)
    .map((r) => r.id)
  if (idsToDelete.length > 0) {
    const { error: delErr } = await sb
      .from('doc_field_mappings')
      .delete()
      .in('id', idsToDelete)
    if (delErr) {
      console.warn('[save-placements:delete]', { code: delErr.code, message: delErr.message })
      return { error: delErr.message || 'Could not clear prior placements.' }
    }
  }

  if (sanitized.length === 0) {
    revalidatePath(`/app/docs/${docId}`)
    revalidatePath(`/app/docs/${docId}/sign-placement`)
    return { ok: true, count: 0 }
  }

  const rows = sanitized.map((p, idx) => ({
    doc_id: docId,
    field_name: `__sig_${p.role}_${idx}`,
    mapping_kind: 'signature' as const,
    signature_role: p.role,
    placement_coords: { page: p.page, x: p.x, y: p.y, w: p.w, h: p.h } as unknown as never,
    data_source_path: null,
  }))
  const { error: insErr } = await sb.from('doc_field_mappings').insert(rows)
  if (insErr) {
    console.warn('[save-placements:insert]', { code: insErr.code, message: insErr.message })
    return { error: insErr.message || 'Could not save placements.' }
  }

  revalidatePath(`/app/docs/${docId}`)
  revalidatePath(`/app/docs/${docId}/sign-placement`)
  return { ok: true, count: sanitized.length }
}
