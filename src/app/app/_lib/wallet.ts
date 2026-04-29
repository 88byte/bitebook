// v27.0a — Wallet data layer.
//
// `wallet_items` is role-agnostic: keyed by user_id (hunter or guide).
// Status (active / used / expired / archived) is DERIVED from valid_to +
// archived_at (used-by-harvest derivation lands in v27.0b once
// harvests.consumed_wallet_item_id ships).
//
// Tabs are role-adaptive: a tab renders if its type is role-primary for the
// user's profiles.role OR if there's at least one item of that type. Pure
// hunters see 5 hunter tabs; pure guides see 3 guide tabs; dual-role users
// (rare) see all 8. Single shared component for both routes.

import { createClient } from '@/lib/supabase/server'
import type { Database, Tables } from '@/lib/supabase/types'

export type WalletItem = Tables<'wallet_items'>
export type WalletItemType = Database['public']['Enums']['wallet_item_type']
export type WalletJurisdiction = Database['public']['Enums']['wallet_jurisdiction']

export const WALLET_TYPES_HUNTER: WalletItemType[] = [
  'license',
  'tag',
  'permit',
  'stamp',
  'harvest_report_card',
]

export const WALLET_TYPES_GUIDE: WalletItemType[] = [
  'guide_license',
  'insurance',
  'business_credential',
]

export type WalletDerivedStatus = 'active' | 'used' | 'expired' | 'archived'

export type WalletItemWithStatus = WalletItem & { status: WalletDerivedStatus }

// Status derivation. `used` comes in v27.0b once harvests link to wallet items.
export function deriveStatus(item: WalletItem, now = new Date()): WalletDerivedStatus {
  if (item.archived_at) return 'archived'
  const validTo = new Date(item.valid_to)
  if (Number.isNaN(validTo.getTime())) return 'active'
  if (validTo < new Date(now.toDateString())) return 'expired'
  return 'active'
}

// Renewal banner trigger query: any non-archived row that's expiring within
// the next 7 days OR is already past valid_to.
export async function fetchRenewalAttention(userId: string): Promise<WalletItemWithStatus[]> {
  const supabase = await createClient()
  const sevenDaysOut = new Date()
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
  const cutoff = sevenDaysOut.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('wallet_items')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .lte('valid_to', cutoff)
    .order('valid_to', { ascending: true })
  if (error) {
    console.warn('[wallet.fetchRenewalAttention]', { userId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map((d) => ({ ...d, status: deriveStatus(d) }))
}

// Full wallet for the authenticated user. Used by /app/h/wallet and /app/wallet.
export async function fetchWallet(userId: string): Promise<WalletItemWithStatus[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wallet_items')
    .select('*')
    .eq('user_id', userId)
    .order('valid_to', { ascending: false })
  if (error) {
    console.warn('[wallet.fetchWallet]', { userId, code: error.code, message: error.message })
    return []
  }
  return (data ?? []).map((d) => ({ ...d, status: deriveStatus(d) }))
}

// Group items by type for the tab UI. Returns a Map so the order matches the
// display order (hunter types first, then guide types) — JS Maps preserve
// insertion order.
export function groupByType(items: WalletItemWithStatus[]): Map<WalletItemType, WalletItemWithStatus[]> {
  const groups = new Map<WalletItemType, WalletItemWithStatus[]>()
  for (const t of [...WALLET_TYPES_HUNTER, ...WALLET_TYPES_GUIDE]) groups.set(t, [])
  for (const item of items) {
    groups.get(item.type)?.push(item)
  }
  return groups
}

// Decide which tabs to render given user role + item counts.
export function visibleTabs(
  role: 'guide' | 'hunter' | 'admin',
  groups: Map<WalletItemType, WalletItemWithStatus[]>
): WalletItemType[] {
  const hunterPrimary = role === 'hunter'
  const guidePrimary = role === 'guide'
  const out: WalletItemType[] = []
  for (const t of WALLET_TYPES_HUNTER) {
    if (hunterPrimary || (groups.get(t)?.length ?? 0) > 0) out.push(t)
  }
  for (const t of WALLET_TYPES_GUIDE) {
    if (guidePrimary || (groups.get(t)?.length ?? 0) > 0) out.push(t)
  }
  return out
}

export const TYPE_LABEL: Record<WalletItemType, string> = {
  license: 'Licenses',
  tag: 'Tags',
  permit: 'Permits',
  stamp: 'Stamps',
  harvest_report_card: 'Report Cards',
  guide_license: 'Guide License',
  insurance: 'Insurance',
  business_credential: 'Credentials',
}

export const TYPE_LABEL_SINGULAR: Record<WalletItemType, string> = {
  license: 'License',
  tag: 'Tag',
  permit: 'Permit',
  stamp: 'Stamp',
  harvest_report_card: 'Report card',
  guide_license: 'Guide license',
  insurance: 'Insurance',
  business_credential: 'Credential',
}

// Status sub-groups within a tab. "Tagged out" only renders for tags.
export type StatusGroup = 'active' | 'tagged_out' | 'expired' | 'archived'

export function bucketByStatus(
  items: WalletItemWithStatus[]
): Record<StatusGroup, WalletItemWithStatus[]> {
  const buckets: Record<StatusGroup, WalletItemWithStatus[]> = {
    active: [],
    tagged_out: [],
    expired: [],
    archived: [],
  }
  for (const item of items) {
    if (item.status === 'archived') buckets.archived.push(item)
    else if (item.status === 'used') buckets.tagged_out.push(item)
    else if (item.status === 'expired') buckets.expired.push(item)
    else buckets.active.push(item)
  }
  return buckets
}
