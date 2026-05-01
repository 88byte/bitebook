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

const DOC_COLS =
  'id, guide_id, kind, label, state, file_path, file_mime, form_template_hash, mapping_status, archived_at, created_at, updated_at' as const

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
  if (!opts?.includeArchived) q = q.is('archived_at', null)

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
  const { data, error } = await sb
    .from('docs')
    .select(DOC_COLS)
    .eq('guide_id', guideId)
    .eq('id', docId)
    .maybeSingle()
  if (error) {
    console.warn('[docs.fetchGuideDoc]', { code: error.code, message: error.message })
    return null
  }
  if (!data) return null
  const { count } = await sb
    .from('trip_docs')
    .select('*', { count: 'exact', head: true })
    .eq('doc_id', docId)
  return { ...data, trip_count: count ?? 0 }
}

export type DocCountsByKind = {
  all: number
  waiver: number
  log: number
  resource: number
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
    return { all: 0, waiver: 0, log: 0, resource: 0 }
  }
  const counts: DocCountsByKind = { all: 0, waiver: 0, log: 0, resource: 0 }
  for (const r of data ?? []) {
    counts.all += 1
    counts[r.kind] += 1
  }
  return counts
}
