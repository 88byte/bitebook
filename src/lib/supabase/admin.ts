import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Service-role client. Server-only; never import from a Client Component.
// Bypasses RLS, so use with care.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) in env. ' +
      'Add it to Vercel Production env vars to enable admin auth flows.'
    )
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
