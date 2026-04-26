import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { applyRememberPreference, REMEMBER_COOKIE } from '@/lib/cookies'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()
  const remember = cookieStore.get(REMEMBER_COOKIE)?.value === '1'
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applyRememberPreference(options, remember))
            )
          } catch {
            // Server Component — cookie writes handled by middleware
          }
        },
      },
    }
  )
}
