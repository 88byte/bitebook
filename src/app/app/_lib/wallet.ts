// v27.0a — Wallet server queries. Imports server-only `createClient`. Do
// NOT import this file from client components — use `wallet-utils.ts`
// for pure types/helpers safe in either environment.

import { createClient } from '@/lib/supabase/server'
import { deriveStatus, type WalletItemWithStatus } from './wallet-utils'

// Re-export types/utils so existing call sites that import from `./wallet`
// keep working. Server-only callers can grab fetch* from here too.
export * from './wallet-utils'

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
