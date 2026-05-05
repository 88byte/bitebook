// v27.5.0 — Warden Share helpers.
//
// Composes the existing harvest-log-fill + harvest-log-sign primitives
// to guarantee the warden view always renders a *signed* PDF set:
//
//   1. Group `trip_generated_logs` rows into "log sets" — rows that share
//      a (source_doc_id, created_at within 60s) bucket are one
//      multi-pass set (CDFW 992-B with >2 hunters produces multiple
//      pass rows per fill).
//   2. Pick the freshest set by max(updated_at).
//   3. For any row in that set that lacks a signed_file_path, sign it
//      on-the-fly with the guide's saved default signature.
//   4. Return signed URLs for each row in the set, in pass order.
//
// Auto-generate fallback (when zero rows exist for the trip) is owned
// by the warden page itself, not this helper — it requires the guide's
// default_log_doc_id and the active harvest_log id, both of which the
// page already has loaded.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { signHarvestLogPdfAction } from './harvest-log-sign'
import { loadGuideDefaultSignatureDataUrl } from './guide-default-signature'

export type WardenLogSetRow = {
  id: string
  pass_index: number
  pass_total: number
  /** Always populated — guaranteed by ensureLatestSetSigned. */
  signed_file_path: string
  signed_file_name: string
  signed_at: string
  /** Signed URL (1h expiry) for the signed PDF object. */
  signed_url: string
}

export type WardenLogSet = {
  set_key: string
  source_doc_id: string | null
  /** Max updated_at across all rows in the set (drives picker label). */
  set_updated_at: string
  rows: WardenLogSetRow[]
}

export type EnsureWardenSetResult =
  | { ok: true; set: WardenLogSet; allSets: Array<{ set_key: string; label: string; updated_at: string }> }
  | { error: 'no_logs' | 'no_default_signature' | 'sign_failed' | 'storage_failed'; detail?: string }

// 60-second clustering window. The fill engine writes all passes for a
// single Generate event in tight succession; 60s gives slack for slow
// uploads while still keeping separate Re-generate events as separate
// sets.
const SET_BUCKET_MS = 60_000

type RawRow = {
  id: string
  pass_index: number
  pass_total: number
  source_doc_id: string | null
  created_at: string
  updated_at: string
  signed_file_path: string | null
  signed_file_name: string | null
  signed_at: string | null
}

// Group flat rows into log sets keyed by (source_doc_id, time-bucket).
// Returns sets sorted by set_updated_at DESC (freshest first).
function groupRowsIntoSets(rows: RawRow[]): Array<{
  set_key: string
  source_doc_id: string | null
  set_updated_at: string
  rows: RawRow[]
}> {
  // Sort ascending by created_at so our bucket walk produces stable keys.
  const sorted = [...rows].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  )
  const buckets: Array<{
    set_key: string
    source_doc_id: string | null
    bucket_start: number
    set_updated_at: string
    rows: RawRow[]
  }> = []
  for (const row of sorted) {
    const t = new Date(row.created_at).getTime()
    const last = buckets[buckets.length - 1]
    if (
      last &&
      last.source_doc_id === row.source_doc_id &&
      t - last.bucket_start <= SET_BUCKET_MS
    ) {
      last.rows.push(row)
      if (row.updated_at > last.set_updated_at) last.set_updated_at = row.updated_at
    } else {
      buckets.push({
        set_key: `${row.source_doc_id ?? 'null'}|${row.created_at}`,
        source_doc_id: row.source_doc_id,
        bucket_start: t,
        set_updated_at: row.updated_at,
        rows: [row],
      })
    }
  }
  // Sort each set's rows by pass_index ascending so multi-page renders
  // come out in the right order.
  for (const b of buckets) {
    b.rows.sort((a, b2) => a.pass_index - b2.pass_index)
  }
  // Newest set first.
  return buckets.sort((a, b) => b.set_updated_at.localeCompare(a.set_updated_at))
}

// Build a human-readable label for the picker: "May 4 · CDFW 992-B".
// Doc name is best-effort — we accept the lookup failing and just show
// the date.
async function buildSetLabels(
  sets: Array<{ set_key: string; source_doc_id: string | null; set_updated_at: string }>
): Promise<Array<{ set_key: string; label: string; updated_at: string }>> {
  const sb = await createClient()
  const docIds = Array.from(
    new Set(sets.map((s) => s.source_doc_id).filter((x): x is string => !!x))
  )
  const docNameById = new Map<string, string>()
  if (docIds.length > 0) {
    const { data } = await sb.from('docs').select('id, label').in('id', docIds)
    for (const d of data ?? []) {
      if (d.id && d.label) docNameById.set(d.id, d.label)
    }
  }
  return sets.map((s) => {
    const dt = new Date(s.set_updated_at)
    const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const docName = s.source_doc_id ? docNameById.get(s.source_doc_id) : null
    const label = docName ? `${date} · ${docName}` : date
    return { set_key: s.set_key, label, updated_at: s.set_updated_at }
  })
}

// Sign one unsigned row using the guide's default signature. Returns
// the post-sign signed_file_path or null on error.
async function signRowWithDefault(
  rowId: string,
  signatureDataUrl: string
): Promise<{ ok: true; signedFilePath: string; signedAt: string } | { error: string }> {
  const res = await signHarvestLogPdfAction(rowId, signatureDataUrl)
  if ('error' in res) return { error: res.error }
  return { ok: true, signedFilePath: res.signedFilePath, signedAt: res.signedAt }
}

// Ensure every row in the latest set has a signed_file_path. Auto-signs
// any unsigned row using the guide's default signature.
//
// Caller has already verified the trip belongs to the guide.
export async function ensureLatestSetSigned(
  tripId: string,
  guideId: string
): Promise<EnsureWardenSetResult> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_generated_logs')
    .select(
      'id, pass_index, pass_total, source_doc_id, created_at, updated_at, signed_file_path, signed_file_name, signed_at'
    )
    .eq('trip_id', tripId)
    .order('updated_at', { ascending: false })
  if (error) {
    console.warn('[warden.ensureLatestSetSigned.read]', { code: error.code, message: error.message })
    return { error: 'storage_failed', detail: error.message }
  }
  const rows = (data ?? []) as RawRow[]
  if (rows.length === 0) return { error: 'no_logs' }

  const sets = groupRowsIntoSets(rows)
  const latest = sets[0]
  const otherSets = sets.slice(1)

  const needsSigning = latest.rows.some((r) => !r.signed_file_path)

  // Only load the default signature if we actually need it.
  if (needsSigning) {
    const sigDataUrl = await loadGuideDefaultSignatureDataUrl(guideId)
    if (!sigDataUrl) return { error: 'no_default_signature' }

    // Sign sequentially — signHarvestLogPdfAction is heavy (PDF download,
    // pdf-lib edit, upload) and we don't want to thrash storage on a set
    // with 5+ unsigned passes. Most cases are 1-2 passes anyway.
    for (const r of latest.rows) {
      if (r.signed_file_path) continue
      const res = await signRowWithDefault(r.id, sigDataUrl)
      if ('error' in res) {
        console.warn('[warden.ensureLatestSetSigned.sign]', { rowId: r.id, error: res.error })
        return { error: 'sign_failed', detail: res.error }
      }
      r.signed_file_path = res.signedFilePath
      r.signed_file_name = (r.signed_file_name ?? '').length > 0
        ? r.signed_file_name
        : `${r.id}-signed.pdf`
      r.signed_at = res.signedAt
    }
  }

  // Build signed URLs in parallel for the now-guaranteed-signed rows.
  const signedUrls = await Promise.all(
    latest.rows.map(async (r) => {
      if (!r.signed_file_path) return null
      const { data: sig, error: sigErr } = await sb.storage
        .from('bb-private')
        .createSignedUrl(r.signed_file_path, 60 * 60)
      if (sigErr) {
        console.warn('[warden.signedUrl]', { rowId: r.id, code: sigErr.message })
        return null
      }
      return sig?.signedUrl ?? null
    })
  )

  const setRows: WardenLogSetRow[] = []
  for (let i = 0; i < latest.rows.length; i++) {
    const r = latest.rows[i]
    const url = signedUrls[i]
    if (!r.signed_file_path || !r.signed_at || !url) {
      return { error: 'storage_failed', detail: 'signed URL build failed' }
    }
    setRows.push({
      id: r.id,
      pass_index: r.pass_index,
      pass_total: r.pass_total,
      signed_file_path: r.signed_file_path,
      signed_file_name: r.signed_file_name ?? `${r.id}-signed.pdf`,
      signed_at: r.signed_at,
      signed_url: url,
    })
  }

  const allSets = await buildSetLabels(sets)

  return {
    ok: true,
    set: {
      set_key: latest.set_key,
      source_doc_id: latest.source_doc_id,
      set_updated_at: latest.set_updated_at,
      rows: setRows,
    },
    allSets,
  }
}

// Pick a specific set by set_key (used when the warden picker switches
// between historic generated PDF sets). Same signing guarantee.
export async function ensureSetSigned(
  tripId: string,
  guideId: string,
  setKey: string
): Promise<EnsureWardenSetResult> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('trip_generated_logs')
    .select(
      'id, pass_index, pass_total, source_doc_id, created_at, updated_at, signed_file_path, signed_file_name, signed_at'
    )
    .eq('trip_id', tripId)
  if (error) {
    return { error: 'storage_failed', detail: error.message }
  }
  const rows = (data ?? []) as RawRow[]
  if (rows.length === 0) return { error: 'no_logs' }

  const sets = groupRowsIntoSets(rows)
  const target = sets.find((s) => s.set_key === setKey) ?? sets[0]

  const needsSigning = target.rows.some((r) => !r.signed_file_path)
  if (needsSigning) {
    const sigDataUrl = await loadGuideDefaultSignatureDataUrl(guideId)
    if (!sigDataUrl) return { error: 'no_default_signature' }
    for (const r of target.rows) {
      if (r.signed_file_path) continue
      const res = await signRowWithDefault(r.id, sigDataUrl)
      if ('error' in res) return { error: 'sign_failed', detail: res.error }
      r.signed_file_path = res.signedFilePath
      r.signed_at = res.signedAt
      r.signed_file_name = r.signed_file_name ?? `${r.id}-signed.pdf`
    }
  }

  const signedUrls = await Promise.all(
    target.rows.map(async (r) => {
      if (!r.signed_file_path) return null
      const { data: sig } = await sb.storage
        .from('bb-private')
        .createSignedUrl(r.signed_file_path, 60 * 60)
      return sig?.signedUrl ?? null
    })
  )

  const setRows: WardenLogSetRow[] = target.rows.map((r, i) => ({
    id: r.id,
    pass_index: r.pass_index,
    pass_total: r.pass_total,
    signed_file_path: r.signed_file_path!,
    signed_file_name: r.signed_file_name ?? `${r.id}-signed.pdf`,
    signed_at: r.signed_at!,
    signed_url: signedUrls[i] ?? '',
  }))

  const allSets = await buildSetLabels(sets)

  return {
    ok: true,
    set: {
      set_key: target.set_key,
      source_doc_id: target.source_doc_id,
      set_updated_at: target.set_updated_at,
      rows: setRows,
    },
    allSets,
  }
}

// Cheap precheck used by trip detail to decide whether to show the
// "Share with warden" button. Returns true if at least one
// trip_generated_logs row exists for the trip.
export async function tripHasAnyGeneratedLog(tripId: string): Promise<boolean> {
  const sb = await createClient()
  const { count, error } = await sb
    .from('trip_generated_logs')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
  if (error) {
    console.warn('[warden.tripHasAnyGeneratedLog]', { code: error.code, message: error.message })
    return false
  }
  return (count ?? 0) > 0
}
