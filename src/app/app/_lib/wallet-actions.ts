'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from './auth'
import type { Database, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

type WalletItemType = Database['public']['Enums']['wallet_item_type']
type WalletJurisdiction = Database['public']['Enums']['wallet_jurisdiction']
type WalletInsert = TablesInsert<'wallet_items'>
type WalletUpdate = TablesUpdate<'wallet_items'>

export type WalletActionResult =
  | { ok: true; id: string }
  | { error: string }

const ALL_TYPES: WalletItemType[] = [
  'license', 'tag', 'permit', 'stamp', 'harvest_report_card',
  'guide_license', 'insurance', 'business_credential',
]
const ALL_JURISDICTIONS: WalletJurisdiction[] = ['federal', 'state']

function readForm(fd: FormData) {
  const get = (k: string): string | null => {
    const v = fd.get(k)
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
  }
  return get
}

type ParsedRequired =
  | { ok: false; error: string }
  | {
      ok: true
      type: WalletItemType
      jurisdiction: WalletJurisdiction
      identifier: string
      valid_from: string
      valid_to: string
    }

function parseRequired(get: (k: string) => string | null): ParsedRequired {
  const typeRaw = get('type')
  const jurisdictionRaw = get('jurisdiction') ?? 'state'
  const identifier = get('identifier')
  const validFrom = get('valid_from')
  const validTo = get('valid_to')

  if (!typeRaw || !ALL_TYPES.includes(typeRaw as WalletItemType)) {
    return { ok: false, error: 'Pick a wallet item type.' }
  }
  if (!ALL_JURISDICTIONS.includes(jurisdictionRaw as WalletJurisdiction)) {
    return { ok: false, error: 'Pick a jurisdiction.' }
  }
  if (!identifier) return { ok: false, error: 'Identifier is required.' }
  if (!validFrom) return { ok: false, error: 'Valid from is required.' }
  if (!validTo) return { ok: false, error: 'Valid to is required.' }
  if (new Date(validTo) < new Date(validFrom)) {
    return { ok: false, error: 'Valid to must be on or after Valid from.' }
  }
  return {
    ok: true,
    type: typeRaw as WalletItemType,
    jurisdiction: jurisdictionRaw as WalletJurisdiction,
    identifier,
    valid_from: validFrom,
    valid_to: validTo,
  }
}

function basePathForRole(role: string): '/app/h/wallet' | '/app/wallet' {
  return role === 'hunter' ? '/app/h/wallet' : '/app/wallet'
}

// Read type-specific extras from the form. Per the canonical-fields research
// at /Users/flave/Documents/Claude/Projects/Last Bite Pro/2026-04-29-wallet-fields-by-type.md.
// Anything beyond the 9 structured columns (identifier, state, species, zone,
// season_year, issue_date, valid_from, valid_to, jurisdiction) goes here.
const EXTRAS_KEYS = [
  // Insurance (ACORD 25 baseline; multi-coverage breakdown is a v27.0a.x add)
  'insurer',
  'policy_number',
  'coverage_per_occurrence',
  'coverage_aggregate',
  'named_insured',
  'additional_insured',
  // Business credential
  'credential_course',
  'credential_level',
  'issuer',
  'instructor_id',
  // Guide license
  'license_class',
  'business_name',
  // Hunter license
  'hunter_ed_number',
  'license_type_code',
  'residency',
  // Tag
  'tag_type',
  'weapon_restriction',
  'sex_restriction',
  // Permit
  'permit_type',
  'landowner_name',
  // Stamp
  'stamp_signed',
  // Harvest Report Card
  'report_due_date',
] as const

function readExtras(fd: FormData): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const key of EXTRAS_KEYS) {
    const v = fd.get(`extras_${key}`)
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

// v27.0b.4.6: ROOT CAUSE FIX for "wallet edits don't propagate to harvest
// log method".
//
// Why v27.0b.4.5 looked broken even though the precedence chain was right:
// fetchTripDetail / fetchHunterTripDetail correctly read wallet first, but
// the trip detail page is server-rendered and its data was stuck in Next's
// Router Cache after the wallet update. updateWalletItemAction was only
// busting `/app/wallet` or `/app/h/wallet`, never `/app/trips/[id]` or
// `/app/h/trips/[id]`. So the hunter saved a wallet edit, navigated to the
// trip, and Next served the prerendered HTML from before the edit.
//
// Layout-level revalidation here is a hammer (busts every trip detail
// page, not just the ones bound to this wallet item) but the alternative
// is querying trip_wallet_items + harvests on every wallet save to find
// which trips reference this item — more SQL for a hot path. Layout
// revalidation is cheap and correct.
function revalidateAfterWalletChange(role: 'guide' | 'hunter' | 'admin' | string) {
  // Wallet roots
  revalidatePath(basePathForRole(role))
  // Trip detail caches on both sides — a wallet edit can change
  // species_display / tag_number_display / method_display in queries.ts.
  revalidatePath('/app/trips', 'layout')
  revalidatePath('/app/h/trips', 'layout')
  // Dashboards (harvest counters, recent activity).
  revalidatePath('/app')
  revalidatePath('/app/h')
}

export async function addWalletItemAction(formData: FormData): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  const get = readForm(formData)
  const parsed = parseRequired(get)
  if (!parsed.ok) return { error: parsed.error }

  const seasonYearRaw = get('season_year')
  const seasonYear = seasonYearRaw ? Number(seasonYearRaw) : null
  if (seasonYearRaw && (!Number.isInteger(seasonYear) || seasonYear! < 1900 || seasonYear! > 2100)) {
    return { error: 'Season year must be a 4-digit year.' }
  }

  // Federal items can have NULL or 'ALL' state. State items require state.
  const stateField = get('state')
  if (parsed.jurisdiction === 'state' && !stateField) {
    return { error: 'State is required for state-issued items.' }
  }

  const extras = readExtras(formData)
  const documentUrl = get('document_url') || null
  // v27.0b.5: single_use is hidden-input-fed boolean string; only meaningful
  // for tags. Default true. Non-tag items take the schema default.
  const singleUseRaw = formData.get('single_use')
  const singleUse =
    parsed.type === 'tag' ? singleUseRaw !== 'false' : true
  const insertPayload: WalletInsert = {
    user_id: profile.id,
    type: parsed.type,
    jurisdiction: parsed.jurisdiction,
    identifier: parsed.identifier,
    state: stateField,
    species: get('species'),
    zone: get('zone'),
    season_year: seasonYear,
    issue_date: get('issue_date'),
    valid_from: parsed.valid_from,
    valid_to: parsed.valid_to,
    notes: get('notes'),
    extras,
    document_url: documentUrl,
    single_use: singleUse,
  }
  const sb = await createClient()
  const { data, error } = await sb
    .from('wallet_items')
    .insert(insertPayload)
    .select('id')
    .single()
  if (error) {
    console.warn('[walletActions.add]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not add wallet item.' }
  }

  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: data.id }
}

export async function updateWalletItemAction(formData: FormData): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  const itemId = String(formData.get('item_id') ?? '').trim()
  if (!itemId) return { error: 'Missing item id.' }

  const get = readForm(formData)
  const parsed = parseRequired(get)
  if (!parsed.ok) return { error: parsed.error }

  const seasonYearRaw = get('season_year')
  const seasonYear = seasonYearRaw ? Number(seasonYearRaw) : null
  const stateField = get('state')
  if (parsed.jurisdiction === 'state' && !stateField) {
    return { error: 'State is required for state-issued items.' }
  }

  const extras = readExtras(formData)
  const documentUrl = get('document_url') || null
  // v27.0b.5: see addWalletItemAction note. Tags only.
  const singleUseRaw = formData.get('single_use')
  const singleUse =
    parsed.type === 'tag' ? singleUseRaw !== 'false' : true
  const sb = await createClient()

  // v27.0b.5.2: detect single_use transition true → false. When the
  // hunter flips a tag to multi-use AND the row was tagged-out, clear
  // tagged_out_at as part of the same save. Multi-use tags shouldn't
  // carry an auto-tag-out state from a prior harvest. Manual tag-outs
  // on multi-use tags can be re-applied via the "Mark as tagged out"
  // button after.
  let clearTaggedOut = false
  if (parsed.type === 'tag' && singleUse === false) {
    const { data: existing } = await sb
      .from('wallet_items')
      .select('single_use, tagged_out_at')
      .eq('id', itemId)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (existing?.single_use === true && existing?.tagged_out_at) {
      clearTaggedOut = true
    }
  }

  const updatePayload: WalletUpdate = {
    type: parsed.type,
    jurisdiction: parsed.jurisdiction,
    identifier: parsed.identifier,
    state: stateField,
    species: get('species'),
    zone: get('zone'),
    season_year: seasonYear,
    issue_date: get('issue_date'),
    valid_from: parsed.valid_from,
    valid_to: parsed.valid_to,
    notes: get('notes'),
    extras,
    document_url: documentUrl,
    single_use: singleUse,
    ...(clearTaggedOut ? { tagged_out_at: null } : {}),
  }
  const { error } = await sb
    .from('wallet_items')
    .update(updatePayload)
    .eq('id', itemId)
    .eq('user_id', profile.id) // RLS belt-and-suspenders
  if (error) {
    console.warn('[walletActions.update]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not update wallet item.' }
  }

  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

export async function archiveWalletItemAction(itemId: string): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!itemId) return { error: 'Missing item id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('wallet_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', profile.id)
  if (error) {
    console.warn('[walletActions.archive]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not archive wallet item.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

export async function restoreWalletItemAction(itemId: string): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!itemId) return { error: 'Missing item id.' }
  const sb = await createClient()
  const { error } = await sb
    .from('wallet_items')
    .update({ archived_at: null })
    .eq('id', itemId)
    .eq('user_id', profile.id)
  if (error) {
    console.warn('[walletActions.restore]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not restore wallet item.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

// v27.0b.1: manual tag-out. Hunter flips an active tag to `used` from the
// wallet item edit page. Sets tagged_out_at = now(); deriveStatus reads
// that and returns 'used' so the card moves to the Tagged Out section on
// next render. Only valid for items of type 'tag'.
export async function tagOutWalletItemAction(itemId: string): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!itemId) return { error: 'Missing item id.' }
  const sb = await createClient()
  // Verify item exists, is owned, and is a tag.
  const { data: item, error: readErr } = await sb
    .from('wallet_items')
    .select('id, type, tagged_out_at, archived_at')
    .eq('id', itemId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (readErr || !item) {
    return { error: readErr?.message || 'Wallet item not found.' }
  }
  if (item.type !== 'tag') {
    return { error: 'Only tag items can be marked tagged out.' }
  }
  if (item.archived_at) {
    return { error: 'Restore the item before marking tagged out.' }
  }
  const { error } = await sb
    .from('wallet_items')
    .update({ tagged_out_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', profile.id)
  if (error) {
    console.warn('[walletActions.tagOut]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not mark tagged out.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

// v27.0b.1: reverse manual tag-out. Refused if a harvest_log_entry references
// this wallet item via tag_wallet_item_id (those go through entry edit or
// delete to unflip).
// v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending).
// Updated to scan harvest_log_entries.tag_wallet_item_id instead.
export async function untagWalletItemAction(itemId: string): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!itemId) return { error: 'Missing item id.' }
  const sb = await createClient()
  // Block if a harvest_log_entry currently consumes this tag.
  const { data: linkedEntries, error: hErr } = await sb
    .from('harvest_log_entries')
    .select('id')
    .eq('tag_wallet_item_id', itemId)
    .limit(1)
  if (hErr) {
    return { error: hErr.message || 'Could not verify harvest links.' }
  }
  if (linkedEntries && linkedEntries.length > 0) {
    return {
      error:
        "This tag is linked to a harvest, can't unmark. Edit or delete the harvest entry first.",
    }
  }
  const { error } = await sb
    .from('wallet_items')
    .update({ tagged_out_at: null })
    .eq('id', itemId)
    .eq('user_id', profile.id)
  if (error) {
    console.warn('[walletActions.untag]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not mark active.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

export async function bulkArchiveExpiredAction(type: WalletItemType): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!ALL_TYPES.includes(type)) return { error: 'Invalid type.' }
  const today = new Date().toISOString().slice(0, 10)
  const sb = await createClient()
  const { error } = await sb
    .from('wallet_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('type', type)
    .is('archived_at', null)
    .lt('valid_to', today)
  if (error) {
    console.warn('[walletActions.bulkArchive]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not archive items.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: 'bulk' }
}

export async function deleteWalletItemAction(itemId: string): Promise<WalletActionResult> {
  const { profile } = await requireUser()
  if (!itemId) return { error: 'Missing item id.' }
  const sb = await createClient()
  // v27.0a policy: only allow hard delete on archived rows. Active rows go
  // through archive first. v27.0b will add the trip-link gate (active items
  // linked to trips are non-deletable until unlinked).
  const { data: row, error: lookupErr } = await sb
    .from('wallet_items')
    .select('id, archived_at, type')
    .eq('id', itemId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (lookupErr) {
    console.warn('[walletActions.delete:lookup]', { code: lookupErr.code, message: lookupErr.message })
    return { error: 'Could not look up item.' }
  }
  if (!row) return { error: 'Item not found.' }
  if (!row.archived_at) {
    return { error: 'Archive the item before deleting.' }
  }
  const { error } = await sb.from('wallet_items').delete().eq('id', itemId).eq('user_id', profile.id)
  if (error) {
    console.warn('[walletActions.delete]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not delete wallet item.' }
  }
  revalidateAfterWalletChange(profile.role)
  return { ok: true, id: itemId }
}

// Hard redirect wrapper for the New form. Keeps the page action simple — on
// successful insert we hop to the wallet root rather than back to /new.
export async function addWalletItemThenRedirectAction(formData: FormData): Promise<void> {
  const result = await addWalletItemAction(formData)
  if ('ok' in result) {
    const { profile } = await requireUser()
    redirect(basePathForRole(profile.role))
  }
  // On error, throw so the form's transition catches it and re-renders.
  throw new Error('error' in result ? result.error : 'Unknown error')
}
