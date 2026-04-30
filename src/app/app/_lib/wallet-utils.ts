// v27.0a — Wallet types and pure utility functions. NO server-only imports.
// Safe to import from client components. Server-only queries live in
// wallet-queries.ts.

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

export function deriveStatus(item: WalletItem, now = new Date()): WalletDerivedStatus {
  if (item.archived_at) return 'archived'
  // v27.0b.1: tagged_out_at takes priority over expired so a tag that
  // was used right before its season expired still reads as a victory,
  // not a stale expiration.
  if (item.tagged_out_at) return 'used'
  const validTo = new Date(item.valid_to)
  if (Number.isNaN(validTo.getTime())) return 'active'
  if (validTo < new Date(now.toDateString())) return 'expired'
  return 'active'
}

export function groupByType(items: WalletItemWithStatus[]): Map<WalletItemType, WalletItemWithStatus[]> {
  const groups = new Map<WalletItemType, WalletItemWithStatus[]>()
  for (const t of [...WALLET_TYPES_HUNTER, ...WALLET_TYPES_GUIDE]) groups.set(t, [])
  for (const item of items) {
    groups.get(item.type)?.push(item)
  }
  return groups
}

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
