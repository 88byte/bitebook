import { NextResponse } from 'next/server'

import { requireGuide } from '@/app/app/_lib/auth'

// v27.7.0 — single round-trip endpoint that returns everything an offline
// active-week dataset needs: trips, participants, profiles, wallet items,
// trip_wallet_items, harvest logs (+ entries / species / user inputs),
// trip_generated_logs, trip_docs, docs (own + bb templates referenced),
// doc_field_mappings, doc_signatures, plus signed URLs for every PDF
// template the active set references and the guide's saved default
// signature data URL.
//
// THIS SHIP HAS NO CLIENT CONSUMER — it's purely the server-side surface
// the v27.7.0.1 read-through hooks will call. Lands now so the contract
// can be reviewed in isolation and tested via curl.
//
// Active window: trips where status IN ('active','planned') AND the trip
// dates overlap a 7-day window (now-7d through now+7d). Canceled and
// completed trips are excluded entirely (per Flavio greenlight #3 — drop
// canceled trips immediately, don't hold for 7 days).
//
// Pre-cache target size estimate: ~50-200 KB JSON for a typical guide
// with 3-5 active trips, 2-5 hunters each. Stays inside iOS quota.

export async function GET() {
  const { supabase, user, profile } = await requireGuide()

  const now = new Date()
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const generatedAt = now.toISOString()

  // 1) Active trips owned by this guide. Status filter excludes canceled
  //    + completed; date overlap filter narrows to the 7-day window.
  const { data: tripsRaw, error: tripsErr } = await supabase
    .from('trips')
    .select('*')
    .eq('guide_id', profile.id)
    .in('status', ['planned', 'active'])
    .gte('ends_at', windowStart)
    .lte('starts_at', windowEnd)
    .order('starts_at', { ascending: true })

  if (tripsErr) {
    return NextResponse.json(
      { error: 'trips_query_failed', message: tripsErr.message },
      { status: 500 }
    )
  }

  const trips = tripsRaw ?? []
  const tripIds = trips.map((t) => t.id)

  // Empty fast path — guide has no active trips. Return a valid (empty)
  // payload rather than skipping queries that would 400 on `in: []`.
  if (tripIds.length === 0) {
    return NextResponse.json({
      schema_version: 1,
      generated_at: generatedAt,
      window_start: windowStart,
      window_end: windowEnd,
      guide_id: profile.id,
      default_signature_data_url: null,
      trips: [],
      trip_participants: [],
      profiles: [],
      wallet_items: [],
      trip_wallet_items: [],
      harvest_logs: [],
      harvest_log_entries: [],
      harvest_log_entry_species: [],
      harvest_log_entry_user_inputs: [],
      harvest_log_user_inputs: [],
      trip_generated_logs: [],
      trip_docs: [],
      docs: [],
      doc_field_mappings: [],
      doc_signatures: [],
      pdf_template_urls: [],
    })
  }

  // 2-3) Participants + harvest logs in parallel — both keyed on trip_ids.
  const [
    { data: participantsRaw },
    { data: logsRaw },
    { data: tripWalletRaw },
    { data: tripDocsRaw },
    { data: tripGeneratedRaw },
  ] = await Promise.all([
    supabase.from('trip_participants').select('*').in('trip_id', tripIds),
    supabase.from('harvest_logs').select('*').in('trip_id', tripIds),
    supabase.from('trip_wallet_items').select('*').in('trip_id', tripIds),
    supabase.from('trip_docs').select('*').in('trip_id', tripIds),
    supabase.from('trip_generated_logs').select('*').in('trip_id', tripIds),
  ])

  const participants = participantsRaw ?? []
  const logs = logsRaw ?? []
  const tripWalletItems = tripWalletRaw ?? []
  const tripDocs = tripDocsRaw ?? []
  const tripGeneratedLogs = tripGeneratedRaw ?? []

  const logIds = logs.map((l) => l.id)
  const hunterIds = Array.from(
    new Set(participants.map((p) => p.hunter_id).filter((id): id is string => !!id))
  )
  const docIds = Array.from(new Set(tripDocs.map((td) => td.doc_id)))
  const tripDocIds = tripDocs.map((td) => td.id)

  // 4) Harvest log entries / species / user inputs (depend on log ids).
  const [
    { data: entriesRaw },
    { data: logUserInputsRaw },
  ] = await Promise.all([
    logIds.length > 0
      ? supabase.from('harvest_log_entries').select('*').in('log_id', logIds)
      : Promise.resolve({ data: [] as never[] }),
    logIds.length > 0
      ? supabase.from('harvest_log_user_inputs').select('*').in('log_id', logIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const entries = entriesRaw ?? []
  const harvestLogUserInputs = logUserInputsRaw ?? []
  const entryIds = entries.map((e) => e.id)

  const [
    { data: speciesRaw },
    { data: entryUserInputsRaw },
  ] = await Promise.all([
    entryIds.length > 0
      ? supabase.from('harvest_log_entry_species').select('*').in('entry_id', entryIds)
      : Promise.resolve({ data: [] as never[] }),
    entryIds.length > 0
      ? supabase.from('harvest_log_entry_user_inputs').select('*').in('entry_id', entryIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const harvestLogEntrySpecies = speciesRaw ?? []
  const harvestLogEntryUserInputs = entryUserInputsRaw ?? []

  // 5) Profiles + wallet items (own + linked via trip_wallet_items).
  const linkedWalletItemIds = Array.from(
    new Set(tripWalletItems.map((t) => t.wallet_item_id).filter((id): id is string => !!id))
  )

  const [
    { data: profilesRaw },
    { data: ownWalletRaw },
    { data: linkedWalletRaw },
  ] = await Promise.all([
    hunterIds.length > 0
      ? supabase.from('profiles').select('*').in('id', hunterIds.concat(profile.id))
      : supabase.from('profiles').select('*').eq('id', profile.id),
    supabase.from('wallet_items').select('*').eq('user_id', user.id),
    linkedWalletItemIds.length > 0
      ? supabase.from('wallet_items').select('*').in('id', linkedWalletItemIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const profiles = profilesRaw ?? []
  const ownWallet = ownWalletRaw ?? []
  const linkedWallet = linkedWalletRaw ?? []
  // Dedupe by id — own and linked sets can overlap when the guide links
  // their own wallet item to a trip.
  const walletMap = new Map<string, (typeof ownWallet)[number]>()
  for (const w of ownWallet) walletMap.set(w.id, w)
  for (const w of linkedWallet) walletMap.set(w.id, w)
  const walletItems = Array.from(walletMap.values())

  // 6) Docs + mappings + signatures (depend on doc ids + trip_doc ids).
  const [
    { data: docsRaw },
    { data: mappingsRaw },
    { data: signaturesRaw },
  ] = await Promise.all([
    docIds.length > 0
      ? supabase.from('docs').select('*').in('id', docIds)
      : Promise.resolve({ data: [] as never[] }),
    docIds.length > 0
      ? supabase.from('doc_field_mappings').select('*').in('doc_id', docIds)
      : Promise.resolve({ data: [] as never[] }),
    tripDocIds.length > 0
      ? supabase.from('doc_signatures').select('*').in('trip_doc_id', tripDocIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const docs = docsRaw ?? []
  const docFieldMappings = mappingsRaw ?? []
  const docSignatures = signaturesRaw ?? []

  // 7) Signed URLs for every doc template the active set references.
  //    1 hour expiry — clients should refetch this endpoint within the
  //    hour or accept that template URLs may have expired.
  const pdfTemplateUrls: Array<{
    doc_id: string
    file_path: string | null
    url: string | null
    expires_at: string
  }> = []
  const expiresIn = 60 * 60 // 1 hour
  const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString()
  for (const d of docs) {
    if (!d.file_path) continue
    const { data: signed, error: signedErr } = await supabase
      .storage.from('bb-private')
      .createSignedUrl(d.file_path, expiresIn)
    pdfTemplateUrls.push({
      doc_id: d.id,
      file_path: d.file_path,
      url: signedErr ? null : (signed?.signedUrl ?? null),
      expires_at: expiresAt,
    })
  }

  // 8) Default signature — pull guide's saved default signature path,
  //    download the PNG, and inline as a data URL so client-sign can run
  //    with no further network calls. Per Flavio greenlight #4.
  let defaultSignatureDataUrl: string | null = null
  const { data: guideRow } = await supabase
    .from('guide_profiles')
    .select('default_signature_path')
    .eq('user_id', user.id)
    .maybeSingle()
  const sigPath = guideRow?.default_signature_path
  if (sigPath) {
    const { data: blob, error: dlErr } = await supabase
      .storage.from('bb-private')
      .download(sigPath)
    if (!dlErr && blob) {
      const buf = Buffer.from(await blob.arrayBuffer())
      defaultSignatureDataUrl = `data:image/png;base64,${buf.toString('base64')}`
    }
  }

  return NextResponse.json({
    schema_version: 1,
    generated_at: generatedAt,
    window_start: windowStart,
    window_end: windowEnd,
    guide_id: profile.id,
    default_signature_data_url: defaultSignatureDataUrl,
    trips,
    trip_participants: participants,
    profiles,
    wallet_items: walletItems,
    trip_wallet_items: tripWalletItems,
    harvest_logs: logs,
    harvest_log_entries: entries,
    harvest_log_entry_species: harvestLogEntrySpecies,
    harvest_log_entry_user_inputs: harvestLogEntryUserInputs,
    harvest_log_user_inputs: harvestLogUserInputs,
    trip_generated_logs: tripGeneratedLogs,
    trip_docs: tripDocs,
    docs,
    doc_field_mappings: docFieldMappings,
    doc_signatures: docSignatures,
    pdf_template_urls: pdfTemplateUrls,
  })
}
