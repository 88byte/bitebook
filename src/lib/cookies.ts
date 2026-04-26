// Strip maxAge/expires so the browser treats the cookie as session-only
// (cleared on browser close). Honors a `bb_remember=1` cookie set during login.
import type { CookieOptions } from '@supabase/ssr'

export const REMEMBER_COOKIE = 'bb_remember'
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export function applyRememberPreference(
  options: CookieOptions,
  remember: boolean
): CookieOptions {
  if (remember) return options
  const next: CookieOptions = { ...options }
  delete next.maxAge
  delete next.expires
  return next
}
