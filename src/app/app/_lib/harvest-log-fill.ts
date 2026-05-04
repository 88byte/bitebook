'use server'

// v27.1.1.0.3b — harvest log auto-fill engine.
// Reads a log + its included entries + their species rows + linked wallet
// items + the doc's field mappings + the original PDF binary, detects slot
// patterns in the PDF's AcroForm field names, fills each field via
// pdf-lib, splits across multiple PDFs on overflow, saves outputs to
// bb-private/logs/{guide_id}/{trip_id}/..., and returns signed URLs for
// inline display on the log page.
//
// v27.1.1.0.3e.3 — generated PDFs now write a row to
// public.trip_generated_logs (per-pass) instead of auto-creating
// docs + trip_docs rows. Keeps the doc library clean. Adds a diagnostic
// pass that pushes warnings when an entry's snapshot data resolves to
// blank for fields the doc's mappings actually reference.

import { revalidatePath } from 'next/cache'
import { requireGuide } from './auth'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib'
import {
  STATIC_TEXT_PREFIX,
  STATIC_DATE_PREFIX,
  STATIC_DATE_RANGE_PREFIX,
  SKIP_VALUE,
  isStaticText,
  staticTextValue,
  isStaticDate,
  staticDateValue,
  isStaticDateRange,
  staticDateRangeValue,
} from './doc-data-sources'
import { parseFieldName } from './harvest-log-fill-types'
import type { FilledPdfArtifact, GenerateFilledLogResult } from './harvest-log-fill-types'

// ── Source resolution ─────────────────────────────────────────────────

type ResolvedValue = string | boolean | null

type EntrySnapshot = {
  id: string
  hunter_id: string | null
  guest_name: string | null
  total_hours: number | null
  notes: string | null
  hunter_phone_snapshot: string | null
  hunter_address_snapshot: Record<string, string | null> | null
  hunter: { display_name: string; phone: string | null } | null
  license: { identifier: string; state: string | null; valid_to: string | null } | null
  tag: {
    identifier: string
    species: string | null
    state: string | null
    zone: string | null
    weapon_restriction: string | null
  } | null
  // v27.3.7.1 item 4: harvest report card pulled from wallet_items via
  // live trip_wallet_items linkage so `hunter_harvest_report_card.*`
  // paths resolve. Was stubbed empty in v27.1.1.0.3d.2.7 — Flavio's
  // PDFs were rendering blank for tag report card fields.
  report_card: {
    identifier: string
    state: string | null
    valid_to: string | null
  } | null
  // v27.3.7.2 item 1: per-row tag_identifier override. Free text on
  // each species row so multi-species hunts can record each tag #
  // separately (the entry-level linked tag only covers one).
  // v27.3.7.3 + v27.3.8.1: 2nd+ rows use a mandatory mode dropdown —
  //   'same'   reuses the entry-level wallet-linked id
  //   'manual' uses the free-text override
  //   'blank'  forces the field empty on the generated PDF
  // Same pattern for harvest_report_card_identifier.
  species_rows: Array<{
    species: string | null
    qty_harvested: number
    qty_released: number
    tag_identifier: string | null
    tag_identifier_mode: 'same' | 'manual' | 'blank' | null
    report_card_identifier: string | null
    report_card_identifier_mode: 'same' | 'manual' | 'blank' | null
  }>
  // v27.3.9: per-entry values for fields the doc mapping flagged as
  // 'user_input.log_time'. Keyed by mapping_field_name. Resolver
  // returns this[fieldName] ?? '' when path === user_input.log_time.
  user_inputs: Record<string, string>
}

type LogContext = {
  trip: {
    title: string | null
    location_city: string | null
    location_state: string | null
    location_zone: string | null
    location_county: string | null
    starts_at: string | null
    ends_at: string | null
    species_targeted: string | null
    method: string | null
    status: string | null
  }
  guide: {
    business_name: string | null
    full_name: string | null
    phone: string | null
    address_street: string | null
    address_street2: string | null
    address_city: string | null
    address_state: string | null
    address_zip: string | null
  }
  guide_license: {
    identifier: string | null
    state: string | null
    valid_to: string | null
  }
  log: {
    log_date: string | null
    trip_purpose: string[]
  }
  entries: EntrySnapshot[]
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  if (!full) return { first: '', last: '' }
  const parts = full.trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function fmtDateMMDDYYYY(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${m}/${day}/${d.getUTCFullYear()}`
}

function joinAddress(snapshot: Record<string, string | null> | null): {
  street1: string
  street2: string
  city: string
  state: string
  postal_code: string
  city_state: string
  full: string
} {
  const s = snapshot ?? {}
  const street1 = (s.street1 ?? '') as string
  const street2 = (s.street2 ?? '') as string
  const city = (s.city ?? '') as string
  const state = (s.state ?? '') as string
  const postal = (s.postal_code ?? '') as string
  const cityState = [city, state].filter(Boolean).join(', ')
  const full = [street1, street2, cityState, postal].filter(Boolean).join(', ')
  return { street1, street2, city, state, postal_code: postal, city_state: cityState, full }
}

// Resolve a saved data_source_path to a value. Slot is 1-indexed (slot 0
// means trip-level).
// v27.3.9: fieldName threaded through so 'user_input.log_time' paths can
// look up the per-entry value persisted in harvest_log_entry_user_inputs
// keyed by (entry_id, mapping_field_name).
function resolveSource(
  path: string,
  ctx: LogContext,
  slot: number,
  fieldName: string
): ResolvedValue {
  if (!path || path === SKIP_VALUE) return null

  // v27.3.9: "Filled at log time" sentinel — value lives on the entry
  // (per-hunter slot), keyed by the original PDF field_name.
  if (path === 'user_input.log_time') {
    if (slot >= 1) {
      const entry = ctx.entries[slot - 1]
      if (!entry) return ''
      return entry.user_inputs[fieldName] ?? ''
    }
    // Trip-level user_input not yet supported — return blank for now.
    return ''
  }

  // v27.2.0.3.4: signature_date.now resolves to TODAY's date at fill
  // time so the date is visible on the generated PDF immediately
  // (Flavio: "i dont see the date on the pdf being generated"). The
  // e-signature engine OVERWRITES this same field with the actual
  // signing date when the doc is signed — so for a doc generated
  // and signed on the same day, the value is identical; for a doc
  // generated then signed later, the sign date wins. The earlier
  // "leave blank to avoid lying" rationale was wrong: the gen-time
  // date represents the fill timestamp, which IS today, and it gets
  // refreshed on actual signing.
  if (path === 'signature_date.now') return fmtDateMMDDYYYY(new Date().toISOString())
  // v27.2.0.3: e_signature.{role} sentinels. Same pattern — fill leaves
  // the AcroForm field blank; the signing engine reads the widget's
  // rect via pdf-lib and stamps the signer's image at sign time.
  if (path === 'e_signature.hunter' || path === 'e_signature.guide') return null

  // Static prefixes
  if (path === 'static:checked') return true
  if (path === 'static:unchecked') return false
  if (isStaticText(path)) return staticTextValue(path)
  if (isStaticDate(path)) return fmtDateMMDDYYYY(staticDateValue(path))
  if (isStaticDateRange(path)) {
    const { start, end } = staticDateRangeValue(path)
    const fs = fmtDateMMDDYYYY(start)
    const fe = fmtDateMMDDYYYY(end)
    return fs && fe ? `${fs} - ${fe}` : ''
  }
  if (path.startsWith(STATIC_TEXT_PREFIX) || path.startsWith(STATIC_DATE_PREFIX) || path.startsWith(STATIC_DATE_RANGE_PREFIX)) {
    return null
  }

  // Trip-level
  if (path === 'trip.title') return ctx.trip.title ?? ''
  if (path === 'trip.location_city') return ctx.trip.location_city ?? ''
  if (path === 'trip.location_state') return ctx.trip.location_state ?? ''
  if (path === 'trip.location_city_state') {
    return [ctx.trip.location_city, ctx.trip.location_state].filter(Boolean).join(', ')
  }
  if (path === 'trip.location_zone') return ctx.trip.location_zone ?? ''
  if (path === 'trip.location_county') return ctx.trip.location_county ?? ''
  if (path === 'trip.start_date') return fmtDateMMDDYYYY(ctx.trip.starts_at)
  if (path === 'trip.end_date') return fmtDateMMDDYYYY(ctx.trip.ends_at)
  if (path === 'trip.species_targeted') return ctx.trip.species_targeted ?? ''
  if (path === 'trip.method') return ctx.trip.method ?? ''
  if (path === 'trip.is_canceled') return ctx.trip.status === 'canceled'

  // Guide
  if (path === 'guide.business_name') return ctx.guide.business_name ?? ''
  if (path === 'guide.full_name') return ctx.guide.full_name ?? ''
  if (path === 'guide.first_name') return splitName(ctx.guide.full_name).first
  if (path === 'guide.last_name') return splitName(ctx.guide.full_name).last
  if (path === 'guide.street1') return ctx.guide.address_street ?? ''
  if (path === 'guide.street2') return ctx.guide.address_street2 ?? ''
  if (path === 'guide.city') return ctx.guide.address_city ?? ''
  if (path === 'guide.state') return ctx.guide.address_state ?? ''
  if (path === 'guide.postal_code') return ctx.guide.address_zip ?? ''
  if (path === 'guide.city_state') {
    return [ctx.guide.address_city, ctx.guide.address_state].filter(Boolean).join(', ')
  }
  if (path === 'guide.address_full') {
    const cityState = [ctx.guide.address_city, ctx.guide.address_state].filter(Boolean).join(', ')
    return [ctx.guide.address_street, ctx.guide.address_street2, cityState, ctx.guide.address_zip]
      .filter(Boolean)
      .join(', ')
  }

  // Guide license (renamed from guide_wallet in v27.1.1.0.3c).
  // guide_wallet.* aliases preserved as a defensive back-compat in case
  // any unmigrated mappings remain — DB migration in v27.1.1.0.3c
  // already moved Flavio's saved mappings.
  if (path === 'guide_license.identifier' || path === 'guide_wallet.identifier') return ctx.guide_license.identifier ?? ''
  if (path === 'guide_license.state' || path === 'guide_wallet.state') return ctx.guide_license.state ?? ''
  if (path === 'guide_license.holder_name' || path === 'guide_wallet.holder_name') return ctx.guide.full_name ?? ''
  if (path === 'guide_license.valid_to' || path === 'guide_wallet.valid_to') return fmtDateMMDDYYYY(ctx.guide_license.valid_to)

  // Trip-level harvest_log
  if (path === 'harvest_log.log_date') return fmtDateMMDDYYYY(ctx.log.log_date)
  if (path === 'harvest_log.total_hours_sum') {
    const sum = ctx.entries.reduce((acc, e) => acc + (Number(e.total_hours) || 0), 0)
    return sum > 0 ? String(sum) : ''
  }
  if (path.startsWith('harvest_log.purpose.has_')) {
    const key = path.slice('harvest_log.purpose.has_'.length)
    return ctx.log.trip_purpose.includes(key)
  }
  // v27.1.1.0.3c.1: string variants — comma-joined summary or the first
  // picked label. Snake_case keys converted to Title Case for display.
  if (path === 'harvest_log.purpose.summary') {
    return ctx.log.trip_purpose.map(formatPurposeLabel).join(', ')
  }
  if (path === 'harvest_log.purpose.first') {
    const first = ctx.log.trip_purpose[0]
    return first ? formatPurposeLabel(first) : ''
  }

  // Per-row sources — resolve against entries[slot-1]. If slot=0 use first
  // entry as a sane fallback for non-slotted PDFs (engine handles overflow
  // by re-rendering trip-level-only PDFs once per included entry, so slot=0
  // resolution sees the single entry of that pass via this same code path
  // with the per-entry context swapped).
  const entry = slot >= 1 ? ctx.entries[slot - 1] : ctx.entries[0]
  if (!entry) return ''

  if (path === 'hunter.full_name') return entry.hunter?.display_name ?? entry.guest_name ?? ''
  if (path === 'hunter.first_name') return splitName(entry.hunter?.display_name ?? entry.guest_name).first
  if (path === 'hunter.last_name') return splitName(entry.hunter?.display_name ?? entry.guest_name).last
  if (path === 'hunter.email') return ''
  if (path === 'hunter.phone') return entry.hunter_phone_snapshot ?? entry.hunter?.phone ?? ''

  const addr = joinAddress(entry.hunter_address_snapshot)
  if (path === 'hunter.street1') return addr.street1
  if (path === 'hunter.street2') return addr.street2
  if (path === 'hunter.city') return addr.city
  if (path === 'hunter.state') return addr.state
  if (path === 'hunter.postal_code') return addr.postal_code
  if (path === 'hunter.city_state') return addr.city_state
  if (path === 'hunter.address_full') return addr.full

  // v27.1.1.0.3e.4: hunter_license.* reads EXCLUSIVELY from
  // entry.license — which is sourced from wallet_items via the live
  // trip_wallet_items linkage in the action above. Never falls back to
  // profiles.license_doc_id; if no wallet license is linked, returns ''
  // and the diagnostic warning surfaces it.
  if (path === 'hunter_license.identifier') return entry.license?.identifier ?? ''
  if (path === 'hunter_license.state') return entry.license?.state ?? ''
  if (path === 'hunter_license.valid_to') return fmtDateMMDDYYYY(entry.license?.valid_to)
  if (path === 'hunter_license.holder_name') return entry.hunter?.display_name ?? entry.guest_name ?? ''

  // v27.3.7.1 item 4: hunter_harvest_report_card.* now resolves against
  // the live-linked wallet_item of type='harvest_report_card' for this
  // entry's hunter (sourced via trip_wallet_items join in the action
  // above). Was stubbed empty in v27.1.1.0.3d.2.7. Edge case: hunter
  // links the report card AFTER the harvest log was created — the live
  // map covers that.
  if (path === 'hunter_harvest_report_card.identifier') return entry.report_card?.identifier ?? ''
  if (path === 'hunter_harvest_report_card.state') return entry.report_card?.state ?? ''
  if (path === 'hunter_harvest_report_card.valid_to')
    return fmtDateMMDDYYYY(entry.report_card?.valid_to)
  if (path === 'hunter_harvest_report_card.holder_name')
    return entry.hunter?.display_name ?? entry.guest_name ?? ''
  // hunter_stamp.* still stubbed — wallet_items doesn't have a 'stamp'
  // type yet. Catalog mapping is preserved.
  if (path.startsWith('hunter_stamp.')) return ''

  if (path === 'wallet_consumed.identifier') return entry.tag?.identifier ?? ''
  if (path === 'wallet_consumed.species') return entry.tag?.species ?? ''
  if (path === 'wallet_consumed.state') return entry.tag?.state ?? ''
  if (path === 'wallet_consumed.zone') return entry.tag?.zone ?? ''
  if (path === 'wallet_consumed.weapon_restriction') return entry.tag?.weapon_restriction ?? ''
  if (path === 'wallet_consumed.is_single_use') return false  // not tracked at fill time
  if (path === 'wallet_consumed.is_federal') return false

  // v27.1.1.0.3c: harvest_log_entry.* (entry-level scalars per slot).
  if (path === 'harvest_log_entry.notes') return entry.notes ?? ''
  if (path === 'harvest_log_entry.total_hours') {
    return entry.total_hours !== null && entry.total_hours !== undefined ? String(entry.total_hours) : ''
  }

  // harvest_log_entry_species[N].field — N is 1-indexed.
  // v27.3.7.2 / v27.3.7.3: tag_identifier + report_card_identifier
  // resolution.
  // 1st species (idx===0): always auto-fills from entry.tag /
  // entry.report_card (the entry-level wallet-linked items).
  // 2nd+ species (idx>=1): mode dropdown drives it —
  //   'same' = inherit the same value as 1st species
  //   'manual' = use the row's typed identifier
  //   null = unset (mandatory; render as blank, the UI flags it
  //          and prevents save until the guide picks one).
  const speciesMatch = /^harvest_log_entry_species\[(\d+)\]\.(species|qty_harvested|qty_released|tag_identifier|report_card_identifier)$/.exec(path)
  if (speciesMatch) {
    const idx = Number(speciesMatch[1]) - 1
    const sp = entry.species_rows[idx]
    if (!sp) return ''
    if (speciesMatch[2] === 'species') return sp.species ?? ''
    if (speciesMatch[2] === 'qty_harvested') return String(sp.qty_harvested)
    if (speciesMatch[2] === 'qty_released') return String(sp.qty_released)
    if (speciesMatch[2] === 'tag_identifier') {
      if (idx === 0) return entry.tag?.identifier ?? ''
      if (sp.tag_identifier_mode === 'same') return entry.tag?.identifier ?? ''
      if (sp.tag_identifier_mode === 'manual') return sp.tag_identifier ?? ''
      // v27.3.8.1: 'blank' explicitly empties the field on the PDF.
      if (sp.tag_identifier_mode === 'blank') return ''
      return ''
    }
    if (speciesMatch[2] === 'report_card_identifier') {
      if (idx === 0) return entry.report_card?.identifier ?? ''
      if (sp.report_card_identifier_mode === 'same') return entry.report_card?.identifier ?? ''
      if (sp.report_card_identifier_mode === 'manual') return sp.report_card_identifier ?? ''
      if (sp.report_card_identifier_mode === 'blank') return ''
      return ''
    }
  }

  // Legacy harvest.* paths — back-compat aliases that resolve to species[0]
  // and the entry-level scalars. Catalog no longer surfaces these but
  // stale mappings shouldn't error.
  const sp0 = entry.species_rows[0]
  if (path === 'harvest.species') return sp0?.species ?? entry.tag?.species ?? ''
  if (path === 'harvest.qty_harvested') return sp0 ? String(sp0.qty_harvested) : ''
  if (path === 'harvest.qty_released') return sp0 ? String(sp0.qty_released) : ''
  if (path === 'harvest.method') return entry.tag?.weapon_restriction ?? ctx.trip.method ?? ''
  if (path === 'harvest.notes') return entry.notes ?? ''
  if (path === 'harvest.total_hours') {
    return entry.total_hours !== null && entry.total_hours !== undefined ? String(entry.total_hours) : ''
  }
  if (path === 'harvest.exists') {
    return ctx.entries.some((e) => e.species_rows.some((s) => (s.qty_harvested || 0) > 0))
  }

  return null
}

// ── Action ────────────────────────────────────────────────────────────

export async function generateFilledHarvestLogPDFsAction(
  logId: string,
  docId: string,
  customName?: string,
  overwriteId?: string,
  // v27.3.9.1: when true, skip the "Filled at log time" blank-check
  // and proceed with whatever values exist. Set by the client after
  // the guide confirms in the soft-warning modal.
  acknowledgeBlanks?: boolean
): Promise<GenerateFilledLogResult> {
  const { profile } = await requireGuide()
  if (!logId || !docId) return { error: 'Missing log or doc id.' }
  // v27.1.4.0.1: optional guide-supplied report name. Empty/undefined →
  // fall through to the auto-generated `{trip.title} — {doc.label}`
  // pattern below. Capped at 120 chars defensively.
  const cleanCustomName = (customName ?? '').trim().slice(0, 120)
  // v27.1.3.0.3: optional overwrite target. When set, the engine
  // upserts the storage object at the EXISTING file_path of this row
  // (no new row inserted) and bumps the row's updated_at. Multi-pass
  // overflow forms aren't supported via overwrite — rejected if the
  // generation would create more than 1 pass.
  const cleanOverwriteId = (overwriteId ?? '').trim() || null

  const sb = await createClient()

  // Verify guide owns the doc + the log's trip.
  const { data: doc } = await sb
    .from('docs')
    .select('id, guide_id, kind, file_path, label, mapping_status')
    .eq('id', docId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!doc) return { error: 'Doc not found.' }
  if (doc.kind !== 'log') return { error: 'Only log docs can be filled.' }
  if (doc.mapping_status !== 'complete' && doc.mapping_status !== 'partial') {
    return { error: 'Set up mapping on this log doc first.' }
  }

  const { data: log } = await sb
    .from('harvest_logs')
    .select('id, trip_id, log_date, trip_purpose')
    .eq('id', logId)
    .maybeSingle()
  if (!log) return { error: 'Harvest log not found.' }

  const { data: trip } = await sb
    .from('trips')
    .select('id, title, city, state, zone, county, starts_at, ends_at, species_targeted, method, status, guide_id')
    .eq('id', log.trip_id)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) return { error: 'Trip not found.' }

  // Mappings. v27.1.1.0.3c.1: hunter_slot column lets the wizard
  // override the regex-detected slot per field.
  // v27.1.1.0.3e.5: optional fallback_path — engine evaluates primary
  // first, falls through if the result is null/empty.
  const { data: mappings } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, fallback_path, mapping_kind, hunter_slot, user_label')
    .eq('doc_id', docId)
    .eq('mapping_kind', 'field')
  type MappingEntry = {
    path: string
    fallbackPath: string | null
    manualSlot: number
    userLabel: string | null
  }
  const mappingByField = new Map<string, MappingEntry>()
  for (const m of mappings ?? []) {
    if (m.field_name && m.data_source_path) {
      const fb = (m as { fallback_path?: string | null }).fallback_path ?? null
      const ul = (m as { user_label?: string | null }).user_label ?? null
      mappingByField.set(m.field_name, {
        path: m.data_source_path,
        fallbackPath: fb && typeof fb === 'string' && fb.trim() ? fb.trim() : null,
        manualSlot: typeof m.hunter_slot === 'number' ? m.hunter_slot : 0,
        userLabel: ul && typeof ul === 'string' && ul.trim() ? ul.trim() : null,
      })
    }
  }
  if (mappingByField.size === 0) {
    return { error: 'No field mappings saved on this doc yet.' }
  }

  // v27.3.9: catalog every (field_name, hunter_slot) pair the doc has
  // mapped to user_input.log_time. The pre-generate gate below checks
  // that EVERY required slot has a saved value before fill runs.
  const userInputMappings: Array<{
    fieldName: string
    label: string
    manualSlot: number
  }> = []
  for (const [fieldName, m] of mappingByField) {
    if (m.path === 'user_input.log_time') {
      userInputMappings.push({
        fieldName,
        label: m.userLabel ?? fieldName,
        manualSlot: m.manualSlot,
      })
    }
  }

  // Entries (only included), preserving insertion / participant order.
  const { data: entryRows } = await sb
    .from('harvest_log_entries')
    .select(
      'id, hunter_id, guest_name, license_wallet_item_id, tag_wallet_item_id, total_hours, notes, include_in_report, hunter_phone_snapshot, hunter_address_snapshot, created_at'
    )
    .eq('log_id', logId)
    .eq('include_in_report', true)
    .order('created_at', { ascending: true })
  const includedEntries = entryRows ?? []
  if (includedEntries.length === 0) {
    return { error: 'No included entries to fill — every hunter is excluded from the report.' }
  }

  const hunterIds = includedEntries.map((e) => e.hunter_id).filter((x): x is string => !!x)
  const entryIds = includedEntries.map((e) => e.id)

  // v27.1.1.0.3e.4: refresh hunter↔license linkage from live trip_wallet_items
  // before we fetch the wallet rows. Entries snapshot license_wallet_item_id
  // at ensureHarvestLog time — if the hunter linked a license AFTER the
  // log was created, the saved snapshot is stale and the PDF would render
  // blank. Reading live here makes the fill always reflect the wallet's
  // current state. Profiles.license_doc_id is intentionally NOT consulted
  // anywhere in this flow.
  // v27.3.7.1 item 4: extended to ALSO live-refresh tag + harvest report
  // card. Same edge case Flavio hit: hunter linked their tag/report card
  // AFTER the log was created (entry snapshot stale → PDF rendered blank
  // for those fields). Now: most-recent linked wallet_item per
  // (hunter, type) wins; entry snapshot is the fallback only.
  const liveLicenseByHunter = new Map<string, string>()
  const liveTagByHunter = new Map<string, string>()
  const liveReportCardByHunter = new Map<string, string>()
  if (hunterIds.length > 0) {
    const { data: twiRows } = await sb
      .from('trip_wallet_items')
      .select('hunter_id, wallet_item_id, linked_at, wallet_items!inner(id, type)')
      .eq('trip_id', trip.id)
      .in('hunter_id', hunterIds)
      .order('linked_at', { ascending: false })
    type TwiRow = {
      hunter_id: string
      wallet_item_id: string
      linked_at: string
      wallet_items: { id: string; type: string }
    }
    for (const r of (twiRows ?? []) as TwiRow[]) {
      const t = r.wallet_items?.type
      if (t === 'license' && !liveLicenseByHunter.has(r.hunter_id)) {
        liveLicenseByHunter.set(r.hunter_id, r.wallet_items.id)
      }
      if (t === 'tag' && !liveTagByHunter.has(r.hunter_id)) {
        liveTagByHunter.set(r.hunter_id, r.wallet_items.id)
      }
      if (t === 'harvest_report_card' && !liveReportCardByHunter.has(r.hunter_id)) {
        liveReportCardByHunter.set(r.hunter_id, r.wallet_items.id)
      }
    }
  }

  // Effective license id per entry: live wallet link wins; fall back to the
  // saved snapshot only if no live link exists. This also means we drop
  // any references to a relinked-then-replaced license item.
  const effectiveLicenseIdByEntry = new Map<string, string | null>()
  // v27.3.7.1 item 4: same pattern for tag — live link beats stale snapshot.
  const effectiveTagIdByEntry = new Map<string, string | null>()
  // v27.3.7.1 item 4: report card — live link only (no snapshot column
  // existed prior to this; the entry snapshot has no report_card field).
  const effectiveReportCardIdByEntry = new Map<string, string | null>()
  for (const e of includedEntries) {
    const liveL = e.hunter_id ? liveLicenseByHunter.get(e.hunter_id) ?? null : null
    effectiveLicenseIdByEntry.set(e.id, liveL ?? e.license_wallet_item_id ?? null)
    const liveT = e.hunter_id ? liveTagByHunter.get(e.hunter_id) ?? null : null
    effectiveTagIdByEntry.set(e.id, liveT ?? e.tag_wallet_item_id ?? null)
    const liveR = e.hunter_id ? liveReportCardByHunter.get(e.hunter_id) ?? null : null
    effectiveReportCardIdByEntry.set(e.id, liveR)
  }
  const licenseIds = Array.from(
    new Set(
      Array.from(effectiveLicenseIdByEntry.values()).filter((x): x is string => !!x)
    )
  )
  const tagIds = Array.from(
    new Set(
      Array.from(effectiveTagIdByEntry.values()).filter((x): x is string => !!x)
    )
  )
  const reportCardIds = Array.from(
    new Set(
      Array.from(effectiveReportCardIdByEntry.values()).filter((x): x is string => !!x)
    )
  )

  const [
    hunterRes,
    licenseRes,
    tagRes,
    reportCardRes,
    speciesRes,
    userInputsRes,
    guideProfileRes,
    guideBizRes,
    guideLicenseRes,
  ] = await Promise.all([
    hunterIds.length
      ? sb.from('profiles').select('id, display_name, phone').in('id', hunterIds)
      : Promise.resolve({ data: [] }),
    licenseIds.length
      ? sb.from('wallet_items').select('id, identifier, state, valid_to').in('id', licenseIds)
      : Promise.resolve({ data: [] }),
    tagIds.length
      ? sb
          .from('wallet_items')
          .select('id, identifier, species, state, zone, extras')
          .in('id', tagIds)
      : Promise.resolve({ data: [] }),
    // v27.3.7.1 item 4: harvest report card pull for `hunter_harvest_report_card.*`
    reportCardIds.length
      ? sb
          .from('wallet_items')
          .select('id, identifier, state, valid_to')
          .in('id', reportCardIds)
      : Promise.resolve({ data: [] }),
    sb
      .from('harvest_log_entry_species')
      .select('id, entry_id, species, qty_harvested, qty_released, position, tag_identifier, tag_identifier_mode, report_card_identifier, report_card_identifier_mode')
      .in('entry_id', entryIds)
      .order('position', { ascending: true }),
    // v27.3.9: per-entry "Filled at log time" values keyed by
    // (entry_id, mapping_field_name). Used by resolver branch above
    // and by the pre-generate completeness gate.
    entryIds.length
      ? sb
          .from('harvest_log_entry_user_inputs')
          .select('entry_id, mapping_field_name, value')
          .in('entry_id', entryIds)
      : Promise.resolve({ data: [] }),
    sb
      .from('profiles')
      .select('display_name, phone, address_street, address_street2, address_city, address_state, address_zip')
      .eq('id', profile.id)
      .maybeSingle(),
    sb.from('guide_profiles').select('business_name').eq('user_id', profile.id).maybeSingle(),
    sb
      .from('wallet_items')
      .select('identifier, state, valid_to')
      .eq('user_id', profile.id)
      .eq('type', 'guide_license')
      .is('archived_at', null)
      .order('valid_to', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const hunterMap = new Map((hunterRes.data ?? []).map((h) => [h.id, h]))
  const licenseMap = new Map((licenseRes.data ?? []).map((w) => [w.id, w]))
  const tagMap = new Map((tagRes.data ?? []).map((w) => [w.id, w]))
  const reportCardMap = new Map((reportCardRes.data ?? []).map((w) => [w.id, w]))
  const speciesByEntry = new Map<string, NonNullable<typeof speciesRes.data>>()
  for (const s of speciesRes.data ?? []) {
    const arr = speciesByEntry.get(s.entry_id) ?? []
    arr.push(s)
    speciesByEntry.set(s.entry_id, arr)
  }

  // v27.3.9: index user inputs by entry id -> { fieldName: value }.
  // Empty/null values are kept in the map so the gate below can
  // distinguish "saved blank" from "never touched."
  type UserInputRow = { entry_id: string; mapping_field_name: string; value: string | null }
  const userInputsByEntry: Record<string, Record<string, string>> = {}
  for (const r of (userInputsRes.data ?? []) as UserInputRow[]) {
    if (!userInputsByEntry[r.entry_id]) userInputsByEntry[r.entry_id] = {}
    userInputsByEntry[r.entry_id][r.mapping_field_name] = r.value ?? ''
  }

  // v27.3.9 / v27.3.9.1: pre-generate "Filled at log time" check.
  // SOFT confirmation, not a block: when at least one included entry
  // is missing a required input AND the caller did not pass
  // acknowledgeBlanks=true, return a structured `blanks_warning` so
  // the client can render a confirmation modal. After the guide
  // confirms, the client retries with acknowledgeBlanks=true and
  // generation proceeds with empty values for the missing fields.
  if (!acknowledgeBlanks && userInputMappings.length > 0) {
    const missing: Array<{
      hunter: string
      label: string
      field_name: string
      hunter_slot: number
    }> = []
    for (const um of userInputMappings) {
      if (um.manualSlot < 1) continue
      const idx = um.manualSlot - 1
      const e = includedEntries[idx]
      if (!e) continue
      const value = userInputsByEntry[e.id]?.[um.fieldName]
      if (!value || !value.trim()) {
        const hunterName =
          (hunterRes.data ?? []).find((h) => h.id === e.hunter_id)?.display_name ??
          e.guest_name ??
          `Hunter ${um.manualSlot}`
        missing.push({
          hunter: hunterName,
          label: um.label,
          field_name: um.fieldName,
          hunter_slot: um.manualSlot,
        })
      }
    }
    if (missing.length > 0) {
      return { blanks_warning: missing }
    }
  }

  const entries: EntrySnapshot[] = includedEntries.map((e) => {
    const hunter = e.hunter_id ? hunterMap.get(e.hunter_id) ?? null : null
    // v27.1.1.0.3e.4: license sourced via the live wallet linkage map
    // (effectiveLicenseIdByEntry). Wallet-only — never reads
    // profiles.license_doc_id.
    const effectiveLicenseId = effectiveLicenseIdByEntry.get(e.id) ?? null
    const license = effectiveLicenseId ? licenseMap.get(effectiveLicenseId) ?? null : null
    // v27.3.7.1 item 4: tag now sourced via live linkage map (was direct
    // from stale entry snapshot). Same pattern license already used.
    const effectiveTagId = effectiveTagIdByEntry.get(e.id) ?? null
    const tag = effectiveTagId ? tagMap.get(effectiveTagId) ?? null : null
    const tagExtras = (tag?.extras ?? null) as Record<string, unknown> | null
    // v27.3.7.1 item 4: harvest report card from live linkage.
    const effectiveReportCardId = effectiveReportCardIdByEntry.get(e.id) ?? null
    const reportCard = effectiveReportCardId ? reportCardMap.get(effectiveReportCardId) ?? null : null
    return {
      id: e.id,
      hunter_id: e.hunter_id,
      guest_name: e.guest_name,
      total_hours: e.total_hours,
      notes: e.notes,
      hunter_phone_snapshot: e.hunter_phone_snapshot,
      hunter_address_snapshot: (e.hunter_address_snapshot ?? null) as Record<string, string | null> | null,
      hunter,
      license: license
        ? { identifier: license.identifier, state: license.state, valid_to: license.valid_to }
        : null,
      tag: tag
        ? {
            identifier: tag.identifier,
            species: tag.species,
            state: tag.state,
            zone: tag.zone,
            weapon_restriction:
              tagExtras && typeof tagExtras['weapon_restriction'] === 'string'
                ? (tagExtras['weapon_restriction'] as string)
                : null,
          }
        : null,
      report_card: reportCard
        ? {
            identifier: reportCard.identifier,
            state: reportCard.state,
            valid_to: reportCard.valid_to,
          }
        : null,
      user_inputs: userInputsByEntry[e.id] ?? {},
      species_rows: (speciesByEntry.get(e.id) ?? []).map((s) => {
        type ExtendedRow = {
          tag_identifier?: string | null
          tag_identifier_mode?: string | null
          report_card_identifier?: string | null
          report_card_identifier_mode?: string | null
        }
        const ext = s as ExtendedRow
        const tagMode: 'same' | 'manual' | 'blank' | null =
          ext.tag_identifier_mode === 'same' ||
          ext.tag_identifier_mode === 'manual' ||
          ext.tag_identifier_mode === 'blank'
            ? ext.tag_identifier_mode
            : null
        const reportMode: 'same' | 'manual' | 'blank' | null =
          ext.report_card_identifier_mode === 'same' ||
          ext.report_card_identifier_mode === 'manual' ||
          ext.report_card_identifier_mode === 'blank'
            ? ext.report_card_identifier_mode
            : null
        return {
          species: s.species,
          qty_harvested: s.qty_harvested,
          qty_released: s.qty_released,
          // v27.3.7.2 / v27.3.7.3: per-row override values + their
          // mandatory dropdown mode for 2nd+ species rows.
          tag_identifier: ext.tag_identifier ?? null,
          tag_identifier_mode: tagMode,
          report_card_identifier: ext.report_card_identifier ?? null,
          report_card_identifier_mode: reportMode,
        }
      }),
    }
  })

  const guideProfile = guideProfileRes.data
  const guideBiz = guideBizRes.data
  const guideLicense = guideLicenseRes.data ?? null

  const baseCtx: LogContext = {
    trip: {
      title: trip.title,
      location_city: trip.city,
      location_state: trip.state,
      location_zone: trip.zone,
      location_county: trip.county,
      starts_at: trip.starts_at,
      ends_at: trip.ends_at,
      species_targeted: trip.species_targeted,
      method: trip.method,
      status: trip.status,
    },
    guide: {
      business_name: guideBiz?.business_name ?? null,
      full_name: guideProfile?.display_name ?? null,
      phone: guideProfile?.phone ?? null,
      address_street: guideProfile?.address_street ?? null,
      address_street2: guideProfile?.address_street2 ?? null,
      address_city: guideProfile?.address_city ?? null,
      address_state: guideProfile?.address_state ?? null,
      address_zip: guideProfile?.address_zip ?? null,
    },
    guide_license: {
      identifier: guideLicense?.identifier ?? null,
      state: guideLicense?.state ?? null,
      valid_to: guideLicense?.valid_to ?? null,
    },
    log: {
      log_date: log.log_date,
      trip_purpose: Array.isArray(log.trip_purpose) ? (log.trip_purpose as string[]) : [],
    },
    entries,
  }

  // Download the original PDF.
  const { data: blob, error: dlErr } = await sb.storage.from('bb-private').download(doc.file_path)
  if (dlErr || !blob) {
    return { error: 'Could not download the PDF template.' }
  }
  const baseBytes = new Uint8Array(await blob.arrayBuffer())

  // Inspect once to detect slots. v27.1.1.0.3c.1: a field's effective slot
  // is the manual hunter_slot override when > 0, else the regex parse.
  // maxSlot considers both sources so a PDF whose names don't follow the
  // patterns but where the guide explicitly assigned slots still
  // overflows correctly.
  const introspect = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const introspectFields = introspect.getForm().getFields()
  const slotForField = (name: string): number => {
    const manual = mappingByField.get(name)?.manualSlot ?? 0
    if (manual > 0) return manual
    return parseFieldName(name).slot
  }
  const slotsInPdf = introspectFields.map((f) => slotForField(f.getName())).filter((s) => s > 0)
  const maxSlot = slotsInPdf.length > 0 ? Math.max(...slotsInPdf) : 0
  const slotsPerPdf = maxSlot > 0 ? maxSlot : 1
  const passes = Math.ceil(entries.length / slotsPerPdf)

  const warnings: string[] = []
  if (entries.length > slotsPerPdf && maxSlot > 0) {
    warnings.push(
      `${entries.length} hunters mapped across ${passes} PDFs (this form holds ${slotsPerPdf} per page).`
    )
  }

  // v27.1.3.0.3: load the overwrite target if requested. Verify the row
  // belongs to this trip + this guide before letting the engine reuse
  // its file_path. Reject overwrite when the new generation would split
  // into multiple passes — a single PDF can't be re-generated as a
  // multi-pass overflow without leaving stale companion rows behind.
  type OverwriteTarget = { id: string; file_path: string; pass_index: number; pass_total: number }
  let overwriteTarget: OverwriteTarget | null = null
  if (cleanOverwriteId) {
    if (passes > 1) {
      return {
        error:
          'Re-generate skipped — this report now splits across multiple PDFs. Delete the old single-PDF report and Generate fresh to produce the multi-pass set.',
      }
    }
    const { data: ow } = await sb
      .from('trip_generated_logs')
      .select('id, trip_id, file_path, pass_index, pass_total, created_by')
      .eq('id', cleanOverwriteId)
      .maybeSingle()
    if (!ow) return { error: 'Could not load the report to re-generate.' }
    if (ow.trip_id !== log.trip_id) return { error: 'Re-generate target belongs to a different trip.' }
    if (ow.created_by !== profile.id) return { error: 'Not allowed to re-generate this report.' }
    overwriteTarget = {
      id: ow.id,
      file_path: ow.file_path,
      pass_index: ow.pass_index,
      pass_total: ow.pass_total,
    }
  }

  // v27.1.1.0.3e.3 — diagnostic data-side warnings.
  //
  // Many "blank field" reports come from missing snapshot data, not a
  // bug in the engine. Scan the doc's mappings to find which categories
  // (license / address) are referenced per slot, then check each
  // included entry's snapshot. Push a human-fix message when the
  // mapping references data that the entry doesn't have.
  //
  // Categories handled here:
  //   - hunter_license.* (identifier / state / valid_to / holder_name)
  //   - hunter.address_full / .street1 / .street2 / .city / .state /
  //     .postal_code / .city_state
  //
  // Slot resolution mirrors the fill loop: manual hunter_slot override
  // when > 0, else parseFieldName regex. Slot 0 means trip-level — the
  // resolver swaps in the per-pass entries[0], so for a slot-0 mapping
  // we warn against entry-1 only.
  {
    type Cat = 'license' | 'address'
    const categoryRefsBySlot = new Map<number, Set<Cat>>()
    for (const [fieldName, entry] of mappingByField.entries()) {
      const path = entry.path
      let cat: Cat | null = null
      if (path.startsWith('hunter_license.')) cat = 'license'
      else if (
        path === 'hunter.address_full' ||
        path === 'hunter.street1' ||
        path === 'hunter.street2' ||
        path === 'hunter.city' ||
        path === 'hunter.state' ||
        path === 'hunter.postal_code' ||
        path === 'hunter.city_state'
      ) {
        cat = 'address'
      }
      if (!cat) continue
      const manual = entry.manualSlot
      const slot = manual > 0 ? manual : parseFieldName(fieldName).slot
      const set = categoryRefsBySlot.get(slot) ?? new Set<Cat>()
      set.add(cat)
      categoryRefsBySlot.set(slot, set)
    }

    function hunterDisplayName(e: EntrySnapshot): string {
      return e.hunter?.display_name?.trim() || e.guest_name || 'Unknown hunter'
    }
    function addressIsBlank(e: EntrySnapshot): boolean {
      const s = e.hunter_address_snapshot
      if (!s) return true
      const vals = [s.street1, s.street2, s.city, s.state, s.postal_code]
      return vals.every((v) => !v || String(v).trim() === '')
    }

    const warnedLicenseEntryIds = new Set<string>()
    const warnedAddressEntryIds = new Set<string>()

    // Resolve which entry each referenced slot maps to. For trip-level
    // (slot 0) the engine resolves against entries[0] of each pass, so
    // we treat slot 0 as "entries[0]" for the warning purpose. For
    // slot >= 1, that entry slot maps to entries[slot - 1] in pass 1,
    // entries[slot - 1 + slotsPerPdf] in pass 2, etc. Iterate every
    // included entry covered by any slot reference.
    for (const [slot, cats] of categoryRefsBySlot.entries()) {
      const slotEntries: EntrySnapshot[] = []
      if (slot === 0) {
        // Trip-level resolver hits entries[0] of each pass.
        for (let p = 0; p < passes; p++) {
          const e = entries[p * slotsPerPdf]
          if (e) slotEntries.push(e)
        }
      } else {
        for (let p = 0; p < passes; p++) {
          const idx = p * slotsPerPdf + (slot - 1)
          const e = entries[idx]
          if (e) slotEntries.push(e)
        }
      }
      for (const e of slotEntries) {
        const name = hunterDisplayName(e)
        if (cats.has('license') && !e.license && !warnedLicenseEntryIds.has(e.id)) {
          warnings.push(
            `Hunter ${name} has no linked license tag for this trip — license fields will be blank. Fix: open Wallet on the trip and link a license to this hunter.`
          )
          warnedLicenseEntryIds.add(e.id)
        }
        if (cats.has('address') && addressIsBlank(e) && !warnedAddressEntryIds.has(e.id)) {
          warnings.push(
            `Hunter ${name}'s profile has no address on file — address fields will be blank. Fix: hunter updates their profile address, or guide updates the trip wallet.`
          )
          warnedAddressEntryIds.add(e.id)
        }
      }
    }
  }

  // Generate one PDF per pass.
  const artifacts: FilledPdfArtifact[] = []
  for (let pass = 0; pass < passes; pass++) {
    const start = pass * slotsPerPdf
    const end = Math.min(start + slotsPerPdf, entries.length)
    const passEntries = entries.slice(start, end)
    const passCtx: LogContext = { ...baseCtx, entries: passEntries }

    const pdf = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
    const form = pdf.getForm()
    for (const field of form.getFields()) {
      const name = field.getName()
      const mapping = mappingByField.get(name)
      if (!mapping) continue
      const path = mapping.path
      // Manual override wins over regex auto-detect.
      const detectedSlot = slotForField(name)
      const effectiveSlot = detectedSlot
      if (effectiveSlot > passEntries.length) continue
      // v27.1.1.0.3e.5: try primary path, fall through to fallback_path
      // (when set) if primary returns null/'' (empty string or falsy
      // boolean still passes through; only "really nothing" triggers
      // the fallback). Lets a single PDF field accept either-or sources.
      let value = resolveSource(path, passCtx, effectiveSlot, name)
      const isEmpty = (v: ResolvedValue): boolean => v === null || v === ''
      if (isEmpty(value) && mapping.fallbackPath) {
        const fbVal = resolveSource(mapping.fallbackPath, passCtx, effectiveSlot, name)
        if (!isEmpty(fbVal)) value = fbVal
      }
      try {
        if (field instanceof PDFTextField) {
          if (typeof value === 'string') {
            field.setText(value)
          } else if (typeof value === 'boolean') {
            field.setText(value ? 'Yes' : 'No')
          }
        } else if (field instanceof PDFCheckBox) {
          if (value === true) field.check()
          else if (value === false || value === '' || value === null) field.uncheck()
          else if (typeof value === 'string') {
            // Truthy string -> check
            if (['yes', 'true', '1', 'x', 'checked'].includes(value.toLowerCase())) field.check()
            else field.uncheck()
          }
        } else if (field instanceof PDFRadioGroup) {
          if (typeof value === 'string' && value) {
            try {
              field.select(value)
            } catch {
              /* invalid option — skip */
            }
          }
        } else if (field instanceof PDFDropdown) {
          if (typeof value === 'string' && value) {
            try {
              field.select(value)
            } catch {
              /* not in options — skip */
            }
          }
        }
      } catch (e) {
        // Per spec: silently skip fields we can't fill (invalid options,
        // mapped-to-removed-fields, etc.).
        void e
      }
    }

    // v27.2.0.3.2 — DO NOT flatten at generation time. Flatten removes
    // all form fields, including `signature_date.now`-mapped fields
    // that need to remain available so the sign-time engine
    // (harvest-log-sign.ts) can stamp today's date into them when the
    // guide actually signs. Pre-flatten signed: those fields would
    // already be erased, and sign-time `form.getField()` silently
    // fails. The sign engine flattens AFTER filling the date +
    // drawing the signature, so the final signed PDF still ends up
    // baked-in.

    const filledBytes = await pdf.save()

    // v27.1.3.0.3: when overwriting, reuse the existing storage path so
    // any cached signed-URL references stay live (URLs themselves rotate
    // every hour but the underlying object key is stable). For fresh
    // generations, slug+timestamp keeps a unique path per pass.
    let filePath: string
    if (overwriteTarget) {
      filePath = overwriteTarget.file_path
    } else {
      const ts = Date.now()
      const passSuffix = passes > 1 ? `-pt${pass + 1}of${passes}` : ''
      const filename = `${slugify(doc.label)}-${ts}${passSuffix}.pdf`
      filePath = `logs/${profile.id}/${log.trip_id}/${filename}`
    }

    const { error: upErr } = await sb.storage
      .from('bb-private')
      .upload(filePath, filledBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) {
      console.warn('[harvestLog.fill:upload]', { code: upErr.message, path: filePath })
      return { error: `Could not upload generated PDF: ${upErr.message}` }
    }

    // Sign for the response. 1h is plenty for the editor's download buttons.
    const { data: signed } = await sb.storage
      .from('bb-private')
      .createSignedUrl(filePath, 3600)

    // v27.1.1.0.3e.3: write to trip_generated_logs (replaces the old
    // docs + trip_docs auto-insert that polluted the doc library).
    // v27.1.4.0.1: when the guide types a custom Report name, use it as
    // the display label (with pass suffix on overflows). Empty string →
    // fall through to the auto-pattern.
    const baseDisplay = cleanCustomName || `${trip.title ?? 'Trip'} — ${doc.label}`
    const filledLabel =
      passes > 1
        ? `${baseDisplay} (${pass + 1}/${passes})`
        : baseDisplay

    let pageCount: number | null = null
    try {
      pageCount = pdf.getPageCount()
    } catch {
      pageCount = null
    }

    // v27.1.4.0.1: file_name is the display name (the GeneratedReportsTile
    // renders it directly). Persist filledLabel + .pdf instead of the
    // slug+timestamp filename — storage path stays at filePath, so the
    // download button still resolves the underlying object.
    // v27.1.3.0.3: when overwriting, UPDATE the target row's file_name +
    // page_count + updated_at instead of inserting a new row. Storage
    // upload(... { upsert: true }) above already replaced the bytes at
    // the existing file_path. The trigger keeps updated_at synced.
    const displayFileName = `${filledLabel}.pdf`
    let genRowId: string | null = null
    if (overwriteTarget && pass === 0) {
      const { error: updErr } = await sb
        .from('trip_generated_logs')
        .update({
          file_name: displayFileName,
          page_count: pageCount,
          source_doc_id: docId,
        })
        .eq('id', overwriteTarget.id)
        .eq('created_by', profile.id)
      if (updErr) {
        console.warn('[harvestLog.fill:trip_generated_logs.update]', {
          code: updErr.code,
          message: updErr.message,
          id: overwriteTarget.id,
        })
      } else {
        genRowId = overwriteTarget.id
      }
    } else {
      const { data: genRow, error: genErr } = await sb
        .from('trip_generated_logs')
        .insert({
          trip_id: log.trip_id,
          log_id: log.id,
          source_doc_id: docId,
          file_path: filePath,
          file_name: displayFileName,
          page_count: pageCount,
          pass_index: pass + 1,
          pass_total: passes,
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (genErr) {
        console.warn('[harvestLog.fill:trip_generated_logs.insert]', {
          code: genErr.code,
          message: genErr.message,
          path: filePath,
        })
      } else {
        genRowId = genRow?.id ?? null
      }
    }

    artifacts.push({
      id: genRowId ?? '',
      file_path: filePath,
      signed_url: signed?.signedUrl ?? '',
      label: filledLabel,
      index: pass + 1,
      total: passes,
    })
  }

  revalidatePath(`/app/trips/${log.trip_id}`)
  revalidatePath(`/app/trips/${log.trip_id}/log`)
  return { ok: true, artifacts, warnings }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// v27.1.1.0.3c.1: snake_case purpose key → human label. Mirror of the
// PURPOSES list in the editor; kept inline so we don't import client UI.
const PURPOSE_LABELS: Record<string, string> = {
  hunting: 'Hunting',
  big_game: 'Big game',
  fishing: 'Fishing',
  fly_fishing: 'Fly fishing',
  other: 'Other',
}
function formatPurposeLabel(key: string): string {
  return PURPOSE_LABELS[key] ?? key
}

// v27.1.1.0.3e.3 — delete a generated PDF + its trip_generated_logs row.
// RLS already restricts ownership; the explicit created_by check below
// is defense-in-depth. Storage delete is best-effort: if it fails the
// row delete still proceeds so the user can retry without a phantom
// orphan row.
// v27.1.4.0.1: rename a generated report. Storage path stays stable —
// only the `file_name` column (which the GeneratedReportsTile renders
// directly) changes. Decoupling display name from storage object key
// means the rename is a single-row UPDATE; no copy/delete dance, no
// signed-URL invalidation, no stale-cache concerns.
export async function renameTripGeneratedLogAction(
  generatedLogId: string,
  newName: string
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireGuide()
  if (!generatedLogId) return { error: 'Missing generated log id.' }
  const trimmed = (newName ?? '').trim()
  if (!trimmed) return { error: 'Report name cannot be empty.' }
  if (trimmed.length > 200) return { error: 'Report name is too long (200 char max).' }

  const sb = await createClient()
  const { data: row, error: selErr } = await sb
    .from('trip_generated_logs')
    .select('id, trip_id, created_by')
    .eq('id', generatedLogId)
    .maybeSingle()
  if (selErr || !row) return { error: 'Report not found.' }
  if (row.created_by !== profile.id) return { error: 'Not allowed.' }

  // Append .pdf if the guide didn't include the extension. Keeps the
  // download button's filename hint sane on every browser.
  const display = trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`

  const { error: updErr } = await sb
    .from('trip_generated_logs')
    .update({ file_name: display })
    .eq('id', generatedLogId)
    .eq('created_by', profile.id)
  if (updErr) {
    console.warn('[renameTripGeneratedLog]', { code: updErr.code, message: updErr.message })
    return { error: updErr.message || 'Could not rename report.' }
  }

  revalidatePath(`/app/trips/${row.trip_id}`)
  revalidatePath(`/app/trips/${row.trip_id}/log`)
  return { ok: true }
}

export async function deleteTripGeneratedLogAction(
  generatedLogId: string
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireGuide()
  if (!generatedLogId) return { error: 'Missing generated log id.' }

  const sb = await createClient()

  const { data: row, error: selErr } = await sb
    .from('trip_generated_logs')
    .select('id, trip_id, file_path, created_by')
    .eq('id', generatedLogId)
    .maybeSingle()
  if (selErr) {
    console.warn('[deleteTripGeneratedLog:select]', { code: selErr.code, message: selErr.message })
    return { error: 'Could not load this report.' }
  }
  if (!row) return { error: 'Report not found.' }
  if (row.created_by !== profile.id) return { error: 'Not allowed.' }

  if (row.file_path) {
    const { error: rmErr } = await sb.storage.from('bb-private').remove([row.file_path])
    if (rmErr) {
      console.warn('[deleteTripGeneratedLog:storage.remove]', {
        message: rmErr.message,
        path: row.file_path,
      })
      // Proceed with DB delete anyway.
    }
  }

  const { error: delErr } = await sb
    .from('trip_generated_logs')
    .delete()
    .eq('id', generatedLogId)
  if (delErr) {
    console.warn('[deleteTripGeneratedLog:delete]', { code: delErr.code, message: delErr.message })
    return { error: 'Could not delete this report.' }
  }

  revalidatePath(`/app/trips/${row.trip_id}`)
  revalidatePath(`/app/trips/${row.trip_id}/log`)
  return { ok: true }
}
