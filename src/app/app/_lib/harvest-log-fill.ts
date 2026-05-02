'use server'

// v27.1.1.0.3b — harvest log auto-fill engine.
// Reads a log + its included entries + their species rows + linked wallet
// items + the doc's field mappings + the original PDF binary, detects slot
// patterns in the PDF's AcroForm field names, fills each field via
// pdf-lib, splits across multiple PDFs on overflow, saves outputs to
// bb-private/logs/{guide_id}/{trip_id}/..., creates trip_docs rows so the
// generated PDFs surface in the trip's docs section, and returns signed
// URLs for inline display on the log page.

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
  species_rows: Array<{ species: string | null; qty_harvested: number; qty_released: number }>
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
function resolveSource(
  path: string,
  ctx: LogContext,
  slot: number
): ResolvedValue {
  if (!path || path === SKIP_VALUE) return null

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

  // Guide wallet (license)
  if (path === 'guide_wallet.identifier') return ctx.guide_license.identifier ?? ''
  if (path === 'guide_wallet.state') return ctx.guide_license.state ?? ''
  if (path === 'guide_wallet.holder_name') return ctx.guide.full_name ?? ''
  if (path === 'guide_wallet.valid_to') return fmtDateMMDDYYYY(ctx.guide_license.valid_to)

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

  if (path === 'hunter_license.identifier') return entry.license?.identifier ?? ''
  if (path === 'hunter_license.state') return entry.license?.state ?? ''
  if (path === 'hunter_license.valid_to') return fmtDateMMDDYYYY(entry.license?.valid_to)
  if (path === 'hunter_license.holder_name') return entry.hunter?.display_name ?? entry.guest_name ?? ''

  if (path === 'wallet_consumed.identifier') return entry.tag?.identifier ?? ''
  if (path === 'wallet_consumed.species') return entry.tag?.species ?? ''
  if (path === 'wallet_consumed.state') return entry.tag?.state ?? ''
  if (path === 'wallet_consumed.zone') return entry.tag?.zone ?? ''
  if (path === 'wallet_consumed.weapon_restriction') return entry.tag?.weapon_restriction ?? ''
  if (path === 'wallet_consumed.is_single_use') return false  // not tracked at fill time
  if (path === 'wallet_consumed.is_federal') return false

  // Harvest (per-species-row[0] of the per-slot entry).
  const sp = entry.species_rows[0]
  if (path === 'harvest.species') {
    return sp?.species ?? entry.tag?.species ?? ''
  }
  if (path === 'harvest.qty_harvested') return sp ? String(sp.qty_harvested) : ''
  if (path === 'harvest.qty_released') return sp ? String(sp.qty_released) : ''
  if (path === 'harvest.method') return entry.tag?.weapon_restriction ?? ctx.trip.method ?? ''
  if (path === 'harvest.notes') return entry.notes ?? ''
  if (path === 'harvest.total_hours') return entry.total_hours !== null ? String(entry.total_hours) : ''
  if (path === 'harvest.exists') {
    return ctx.entries.some((e) => e.species_rows.some((s) => (s.qty_harvested || 0) > 0))
  }

  return null
}

// ── Action ────────────────────────────────────────────────────────────

export async function generateFilledHarvestLogPDFsAction(
  logId: string,
  docId: string
): Promise<GenerateFilledLogResult> {
  const { profile } = await requireGuide()
  if (!logId || !docId) return { error: 'Missing log or doc id.' }

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

  // Mappings.
  const { data: mappings } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, mapping_kind')
    .eq('doc_id', docId)
    .eq('mapping_kind', 'field')
  const mappingByField = new Map<string, string>()
  for (const m of mappings ?? []) {
    if (m.field_name && m.data_source_path) {
      mappingByField.set(m.field_name, m.data_source_path)
    }
  }
  if (mappingByField.size === 0) {
    return { error: 'No field mappings saved on this doc yet.' }
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
  const licenseIds = includedEntries.map((e) => e.license_wallet_item_id).filter((x): x is string => !!x)
  const tagIds = includedEntries.map((e) => e.tag_wallet_item_id).filter((x): x is string => !!x)
  const entryIds = includedEntries.map((e) => e.id)

  const [hunterRes, licenseRes, tagRes, speciesRes, guideProfileRes, guideBizRes, guideLicenseRes] =
    await Promise.all([
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
      sb
        .from('harvest_log_entry_species')
        .select('id, entry_id, species, qty_harvested, qty_released, position')
        .in('entry_id', entryIds)
        .order('position', { ascending: true }),
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
  const speciesByEntry = new Map<string, NonNullable<typeof speciesRes.data>>()
  for (const s of speciesRes.data ?? []) {
    const arr = speciesByEntry.get(s.entry_id) ?? []
    arr.push(s)
    speciesByEntry.set(s.entry_id, arr)
  }

  const entries: EntrySnapshot[] = includedEntries.map((e) => {
    const hunter = e.hunter_id ? hunterMap.get(e.hunter_id) ?? null : null
    const license = e.license_wallet_item_id ? licenseMap.get(e.license_wallet_item_id) ?? null : null
    const tag = e.tag_wallet_item_id ? tagMap.get(e.tag_wallet_item_id) ?? null : null
    const tagExtras = (tag?.extras ?? null) as Record<string, unknown> | null
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
      species_rows: (speciesByEntry.get(e.id) ?? []).map((s) => ({
        species: s.species,
        qty_harvested: s.qty_harvested,
        qty_released: s.qty_released,
      })),
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

  // Inspect once to detect slots.
  const introspect = await PDFDocument.load(baseBytes, { ignoreEncryption: true })
  const introspectFields = introspect.getForm().getFields()
  const parsed = introspectFields.map((f) => parseFieldName(f.getName()))
  const slotsInPdf = parsed.filter((p) => p.slot > 0).map((p) => p.slot)
  const maxSlot = slotsInPdf.length > 0 ? Math.max(...slotsInPdf) : 0
  const slotsPerPdf = maxSlot > 0 ? maxSlot : 1
  const passes = Math.ceil(entries.length / slotsPerPdf)

  const warnings: string[] = []
  if (entries.length > slotsPerPdf && maxSlot > 0) {
    warnings.push(
      `${entries.length} hunters mapped across ${passes} PDFs (this form holds ${slotsPerPdf} per page).`
    )
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
      const path = mappingByField.get(name)
      if (!path) continue
      const parsedField = parseFieldName(name)
      // Cap slot index — if the PDF has slot 5 and we're on a pass with
      // only 2 entries, leave slots 3-5 blank.
      const effectiveSlot = parsedField.slot
      if (effectiveSlot > passEntries.length) continue
      const value = resolveSource(path, passCtx, effectiveSlot)
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

    // Flatten so the values are baked in (simpler for downstream viewers).
    try {
      form.flatten()
    } catch {
      /* some forms have appearance issues — leave editable if flatten fails */
    }

    const filledBytes = await pdf.save()

    const ts = Date.now()
    const passSuffix = passes > 1 ? `-pt${pass + 1}of${passes}` : ''
    const filename = `${slugify(doc.label)}-${ts}${passSuffix}.pdf`
    const filePath = `logs/${profile.id}/${log.trip_id}/${filename}`

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

    // Auto-attach as a new doc + trip_doc row so the trip's docs section
    // surfaces it. Distinct from the source mapping doc (kind='log',
    // file_path=the filled location, mapping_status='not_applicable').
    const filledLabel =
      passes > 1
        ? `${trip.title ?? 'Trip'} — ${doc.label} (${pass + 1}/${passes})`
        : `${trip.title ?? 'Trip'} — ${doc.label}`

    const { data: newDoc } = await sb
      .from('docs')
      .insert({
        guide_id: profile.id,
        kind: 'log',
        label: filledLabel,
        file_path: filePath,
        file_mime: 'application/pdf',
        mapping_status: 'not_applicable',
      })
      .select('id')
      .single()

    if (newDoc) {
      await sb
        .from('trip_docs')
        .upsert(
          {
            trip_id: log.trip_id,
            doc_id: newDoc.id,
            hunter_visible: true,
            created_by: profile.id,
          },
          { onConflict: 'trip_id,doc_id', ignoreDuplicates: true }
        )
    }

    artifacts.push({
      doc_id: newDoc?.id ?? '',
      file_path: filePath,
      signed_url: signed?.signedUrl ?? '',
      label: filledLabel,
      index: pass + 1,
      total: passes,
    })
  }

  revalidatePath(`/app/trips/${log.trip_id}`)
  revalidatePath(`/app/trips/${log.trip_id}/log`)
  revalidatePath('/app/docs')
  return { ok: true, artifacts, warnings }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
