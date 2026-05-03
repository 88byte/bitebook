import { createClient } from '@/lib/supabase/server'

// v27.1.4 — Trip-template read queries.
// Owner-only via RLS; the .eq('owner_id', guideId) filters here are
// defense-in-depth and let us narrow before RLS evaluates.

export type TripTemplateSummary = {
  id: string
  label: string
  activity: string | null
  state: string | null
  city: string | null
  location_zone: string | null
  location_county: string | null
  species_targeted: string | null
  method: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  doc_count: number
}

export async function fetchGuideTripTemplates(
  guideId: string,
  opts?: { includeArchived?: boolean }
): Promise<TripTemplateSummary[]> {
  const sb = await createClient()
  let q = sb
    .from('trip_templates')
    .select(
      'id, label, activity, state, city, location_zone, location_county, species_targeted, method, archived_at, created_at, updated_at'
    )
    .eq('owner_id', guideId)
    .order('updated_at', { ascending: false })

  // Mirror the docs-library archive-filter semantics (v27.1.1.0.3e.7):
  // includeArchived=true means "archived ONLY", not "active+archived".
  if (opts?.includeArchived) q = q.not('archived_at', 'is', null)
  else q = q.is('archived_at', null)

  const { data, error } = await q
  if (error) {
    console.warn('[trip-templates.fetchGuideTripTemplates]', { code: error.code, message: error.message })
    return []
  }
  if (!data || data.length === 0) return []

  // Doc-count batch — single fetch over trip_template_docs filtered to
  // the visible templates. JS-side aggregation since Supabase JS doesn't
  // return GROUP BY counts directly.
  const ids = data.map((t) => t.id)
  const { data: linkRows } = await sb
    .from('trip_template_docs')
    .select('template_id')
    .in('template_id', ids)
  const docCount = new Map<string, number>()
  for (const r of linkRows ?? []) {
    docCount.set(r.template_id, (docCount.get(r.template_id) ?? 0) + 1)
  }
  return data.map((t) => ({ ...t, doc_count: docCount.get(t.id) ?? 0 }))
}

// Fetch one template by id with its linked docs. Used by the "Use
// template" picker on /app/trips/new and the template detail/edit view.
export async function fetchGuideTripTemplate(
  guideId: string,
  templateId: string
): Promise<{ template: TripTemplateSummary; doc_ids: string[] } | null> {
  const sb = await createClient()
  const { data: t, error } = await sb
    .from('trip_templates')
    .select(
      'id, label, activity, state, city, location_zone, location_county, species_targeted, method, archived_at, created_at, updated_at'
    )
    .eq('id', templateId)
    .eq('owner_id', guideId)
    .maybeSingle()
  if (error || !t) return null
  const { data: docs } = await sb
    .from('trip_template_docs')
    .select('doc_id')
    .eq('template_id', templateId)
  const doc_ids = (docs ?? []).map((r) => r.doc_id)
  return {
    template: { ...t, doc_count: doc_ids.length },
    doc_ids,
  }
}
