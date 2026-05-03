import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// v27.1.0 — Documents Module read queries.
// Guide-only for v27.1.0; hunter-side reads land in v27.1.3 alongside
// the trip-attachment + hunter trip detail Docs section.

export type DocKind = Database['public']['Enums']['doc_kind']
export type DocRow = Database['public']['Tables']['docs']['Row']

export type DocSummary = DocRow & {
  trip_count: number
}

// v27.1.5.3.5: replaced_at added to the SELECT projection so DocSummary
// (which extends DocRow) stays type-compatible with the row shape after
// the new column landed.
const DOC_COLS =
  'id, guide_id, kind, label, state, file_path, file_mime, form_template_hash, mapping_status, archived_at, is_template, created_at, updated_at, replaced_at' as const

export async function fetchGuideDocs(
  guideId: string,
  opts?: { kind?: DocKind | 'all'; includeArchived?: boolean }
): Promise<DocSummary[]> {
  const sb = await createClient()
  let q = sb
    .from('docs')
    .select(DOC_COLS)
    .eq('guide_id', guideId)
    .order('updated_at', { ascending: false })

  if (opts?.kind && opts.kind !== 'all') q = q.eq('kind', opts.kind)
  // v27.1.1.0.3e.7: includeArchived=true now means "archived ONLY" instead
  // of "active + archived mixed in". Toggling 'Show archived' on /app/docs
  // should reveal the archived bucket as a distinct view, not append
  // archived rows to the active list.
  if (opts?.includeArchived) q = q.not('archived_at', 'is', null)
  else q = q.is('archived_at', null)

  const { data, error } = await q
  if (error) {
    console.warn('[docs.fetchGuideDocs]', { code: error.code, message: error.message })
    return []
  }
  if (!data || data.length === 0) return []

  // Trip attachment counts — single grouped fetch over trip_docs filtered to
  // these doc_ids. JS-side aggregation since Supabase JS client doesn't return
  // GROUP BY counts directly. Sample size is small (a guide's library), so
  // this is fine.
  const ids = data.map((d) => d.id)
  const { data: tdRows } = await sb
    .from('trip_docs')
    .select('doc_id')
    .in('doc_id', ids)
  const tripCount = new Map<string, number>()
  for (const r of tdRows ?? []) {
    tripCount.set(r.doc_id, (tripCount.get(r.doc_id) ?? 0) + 1)
  }
  return data.map((d) => ({ ...d, trip_count: tripCount.get(d.id) ?? 0 }))
}

export async function fetchGuideDoc(
  guideId: string,
  docId: string
): Promise<DocSummary | null> {
  const sb = await createClient()
  // v27.1.1.0.3e: drop the `.eq('guide_id', ...)` defense-in-depth filter so
  // non-owner viewers can resolve a Bite Book template (RLS still gates the
  // read via docs_template_select). The doc-detail page reads guide_id off
  // the row to compute viewerOwnsDoc and falls into a read-only branch when
  // the caller isn't the owner.
  const { data, error } = await sb
    .from('docs')
    .select(DOC_COLS)
    .eq('id', docId)
    .maybeSingle()
  if (error) {
    console.warn('[docs.fetchGuideDoc]', { code: error.code, message: error.message })
    return null
  }
  if (!data) return null
  // Defense-in-depth: only owners or template viewers should resolve. RLS
  // already enforces this; we double-check here so a misconfigured policy
  // can't leak someone else's library doc.
  if (data.guide_id !== guideId && !data.is_template) return null
  const { count } = await sb
    .from('trip_docs')
    .select('*', { count: 'exact', head: true })
    .eq('doc_id', docId)
  return { ...data, trip_count: count ?? 0 }
}

// v27.1.1.0.3e — Bite Book templates section on the library page. Returns
// is_template=true docs the caller does NOT own (their own templates already
// appear in their library). RLS policy `docs_template_select` lets any
// authenticated user read template rows; this query just filters them.
export async function fetchBiteBookTemplates(_profileId: string): Promise<DocSummary[]> {
  const sb = await createClient()
  // v27.1.1.0.3e.7: removed `.neq('guide_id', profileId)`. Previously the
  // admin's own promoted templates were hidden from the templates tab to
  // avoid showing them twice. But after v3e.5 split docs into a "My docs"
  // tab vs a "Bite Book templates" tab, the admin's own template flagged
  // via setDocTemplateFlagAction needs to surface in the templates tab.
  // The DocsLibraryList layer no longer renders templates inline alongside
  // owned docs, so the duplicate-display concern is gone.
  const { data, error } = await sb
    .from('docs')
    .select(DOC_COLS)
    .eq('is_template', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[docs.fetchBiteBookTemplates]', { code: error.code, message: error.message })
    return []
  }
  if (!data || data.length === 0) return []
  // Templates aren't attached to trips on the viewer's side; trip_count is
  // always 0 here. The DocRow component still reads the field, so we keep
  // the shape consistent.
  return data.map((d) => ({ ...d, trip_count: 0 }))
}

export type DocCountsByKind = {
  all: number
  waiver: number
  log: number
  resource: number
  templates: number
}

export async function fetchGuideDocCounts(guideId: string): Promise<DocCountsByKind> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('docs')
    .select('kind')
    .eq('guide_id', guideId)
    .is('archived_at', null)
  if (error) {
    console.warn('[docs.fetchGuideDocCounts]', { code: error.code, message: error.message })
    return { all: 0, waiver: 0, log: 0, resource: 0, templates: 0 }
  }
  const counts: DocCountsByKind = { all: 0, waiver: 0, log: 0, resource: 0, templates: 0 }
  for (const r of data ?? []) {
    counts.all += 1
    counts[r.kind] += 1
  }
  // v27.1.1.0.3e: count of non-owner templates this guide can see. Cheap
  // head-count query against the same RLS-gated set fetchBiteBookTemplates
  // returns rows for.
  // v27.1.1.0.3e.7: drop the .neq('guide_id', guideId) filter — admin's own
  // promoted templates now show in the templates tab too.
  const { count: tplCount } = await sb
    .from('docs')
    .select('id', { count: 'exact', head: true })
    .eq('is_template', true)
    .is('archived_at', null)
  counts.templates = tplCount ?? 0
  return counts
}
