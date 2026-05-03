import { createClient } from '@/lib/supabase/server'

// v27.1.3 — Trip-doc + per-hunter action read queries.

export type TripDocRow = {
  id: string
  trip_id: string
  doc_id: string
  hunter_visible: boolean
  created_at: string
  doc: {
    id: string
    label: string
    kind: string
    is_template: boolean
    file_path: string
    state: string | null
  }
  // For the guide-side Manage actions modal.
  actions: Array<{
    id: string
    hunter_id: string
    action_type: string
    required: boolean
    completed_at: string | null
  }>
  // Computed signed URL for the underlying PDF — 1h TTL, refetched on
  // every server render of the trip detail.
  signed_url: string | null
}

// Fetch every trip_doc for a trip. Used on /app/trips/[id] (guide) — RLS
// gates ownership at the DB level; the .eq filter is defense-in-depth.
export async function fetchTripDocsForGuide(tripId: string): Promise<TripDocRow[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_docs')
    .select(
      `id, trip_id, doc_id, hunter_visible, created_at,
       doc:docs!inner(id, label, kind, is_template, file_path, state),
       actions:trip_doc_hunter_actions(id, hunter_id, action_type, required, completed_at)`
    )
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('[trip-docs.fetchForGuide]', { code: error.code, message: error.message })
    return []
  }
  type Joined = Omit<TripDocRow, 'signed_url'> & { doc: TripDocRow['doc'] }
  const rows = (data ?? []) as Joined[]

  // Sign every PDF for inline open / download. 1h is plenty for the
  // trip detail's render cycle.
  const out: TripDocRow[] = []
  for (const r of rows) {
    let signed: string | null = null
    if (r.doc?.file_path) {
      const { data: s } = await sb.storage
        .from('bb-private')
        .createSignedUrl(r.doc.file_path, 3600)
      signed = s?.signedUrl ?? null
    }
    out.push({ ...r, signed_url: signed })
  }
  return out
}

// Hunter-facing version. RLS auto-filters to hunter_visible=true rows
// where the caller is a participant. Same shape as guide minus the
// per-hunter action list (hunter only sees their own action via the
// pending-actions widget).
export async function fetchTripDocsForHunter(
  tripId: string,
  hunterId: string
): Promise<
  Array<
    Omit<TripDocRow, 'actions'> & {
      my_action: TripDocRow['actions'][number] | null
    }
  >
> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_docs')
    .select(
      `id, trip_id, doc_id, hunter_visible, created_at,
       doc:docs!inner(id, label, kind, is_template, file_path, state),
       actions:trip_doc_hunter_actions(id, hunter_id, action_type, required, completed_at)`
    )
    .eq('trip_id', tripId)
    .eq('hunter_visible', true)
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('[trip-docs.fetchForHunter]', { code: error.code, message: error.message })
    return []
  }
  type Joined = Omit<TripDocRow, 'signed_url'> & { doc: TripDocRow['doc'] }
  const rows = (data ?? []) as Joined[]

  const out: Array<
    Omit<TripDocRow, 'actions'> & { my_action: TripDocRow['actions'][number] | null; signed_url: string | null }
  > = []
  for (const r of rows) {
    let signed: string | null = null
    if (r.doc?.file_path) {
      const { data: s } = await sb.storage
        .from('bb-private')
        .createSignedUrl(r.doc.file_path, 3600)
      signed = s?.signedUrl ?? null
    }
    const mine = (r.actions ?? []).find((a) => a.hunter_id === hunterId) ?? null
    out.push({
      id: r.id,
      trip_id: r.trip_id,
      doc_id: r.doc_id,
      hunter_visible: r.hunter_visible,
      created_at: r.created_at,
      doc: r.doc,
      signed_url: signed,
      my_action: mine,
    })
  }
  return out
}

// Hunter-side cross-trip pending actions widget. One row per incomplete
// action, joined to its trip + doc for the dashboard tile.
export type HunterPendingAction = {
  id: string
  action_type: string
  required: boolean
  trip_id: string
  trip_title: string
  doc_label: string
  doc_kind: string
}

export async function fetchHunterPendingActions(hunterId: string): Promise<HunterPendingAction[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_doc_hunter_actions')
    .select(
      `id, action_type, required, completed_at,
       trip_docs!inner(trip_id, trips!inner(id, title), docs!inner(label, kind))`
    )
    .eq('hunter_id', hunterId)
    .is('completed_at', null)
  if (error) {
    console.warn('[trip-docs.fetchHunterPending]', { code: error.code, message: error.message })
    return []
  }
  type Joined = {
    id: string
    action_type: string
    required: boolean
    trip_docs: {
      trip_id: string
      trips: { id: string; title: string }
      docs: { label: string; kind: string }
    }
  }
  return ((data ?? []) as Joined[]).map((r) => ({
    id: r.id,
    action_type: r.action_type,
    required: r.required,
    trip_id: r.trip_docs.trip_id,
    trip_title: r.trip_docs.trips.title,
    doc_label: r.trip_docs.docs.label,
    doc_kind: r.trip_docs.docs.kind,
  }))
}

// v27.1.3 — Attach-doc picker source. Returns the union of (a) the guide's
// own active non-log docs and (b) Bite Book templates the guide can see.
// Excludes archived rows and log-kind docs (those are generated outputs,
// not inputs to a trip). RLS still gates the read; the explicit guide_id
// + is_template filter is defense-in-depth.
export type AttachableDoc = {
  id: string
  label: string
  kind: string
  state: string | null
  is_template: boolean
  guide_id: string
}

export async function fetchAttachableDocsForGuide(guideId: string): Promise<AttachableDoc[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('docs')
    .select('id, label, kind, state, is_template, guide_id, archived_at')
    .or(`guide_id.eq.${guideId},is_template.eq.true`)
    .neq('kind', 'log')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[trip-docs.fetchAttachable]', { code: error.code, message: error.message })
    return []
  }
  type Row = AttachableDoc & { archived_at: string | null }
  return ((data ?? []) as Row[]).map((d) => ({
    id: d.id,
    label: d.label,
    kind: d.kind,
    state: d.state,
    is_template: d.is_template,
    guide_id: d.guide_id,
  }))
}
