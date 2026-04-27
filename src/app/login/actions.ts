'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE, applyRememberPreference } from '@/lib/cookies'

export type SignInState = { error: string } | null

// Server-action sign-in. Replaces the v17/v18 browser-side flow that broke on
// Safari: createBrowserClient writes cookies via document.cookie, then we
// immediately do `window.location.assign('/app')`. Safari's cookie-commit
// timing means the navigation can fire before the cookies are visible to the
// next request → middleware sees no user → redirect to /login → repeat. The
// 20-redirect cap that Flavio saw is the symptom.
//
// Server actions write cookies via Next.js's Set-Cookie headers. The browser
// commits them before following the redirect — no race possible.
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const remember = formData.get('remember') === 'on'
  const nextRaw = String(formData.get('next') ?? '/app')

  if (!email || !password) {
    return { error: 'Please enter your email and password.' }
  }

  const cookieStore = await cookies()

  // Persist the remember choice before sign-in. applyRememberPreference reads
  // this on subsequent middleware runs to decide cookie lifetime.
  if (remember) {
    cookieStore.set(REMEMBER_COOKIE, '1', {
      maxAge: REMEMBER_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } else {
    cookieStore.delete(REMEMBER_COOKIE)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, applyRememberPreference(options, remember))
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.warn('[signInAction] auth error', { email, code: error.code, status: error.status, message: error.message })
    return { error: humanizeError(error.message) }
  }

  // Visible in Vercel runtime logs to verify the server action wrote cookies.
  // Names only — no values — so we don't leak tokens.
  const writtenCookies = cookieStore.getAll().map((c) => c.name)
  console.log('[signInAction] success', { email, cookieCount: writtenCookies.length, cookieNames: writtenCookies })

  const safeNext =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/app'
  redirect(safeNext)
}

function humanizeError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox.'
  if (/over.*rate/i.test(msg)) return 'Too many attempts. Try again in a minute.'
  return msg
}

// Escape-hatch sign-out for users stuck in a redirect loop. Calls Supabase's
// signOut to revoke the session server-side, then explicitly deletes every
// sb-* cookie + the remember flag. Belt-and-braces so a partial state can't
// leave the browser still appearing "signed in" to middleware.
export async function signOutAction() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.signOut().catch(() => {})

  // Explicit cleanup — covers the case where signOut() partially failed.
  cookieStore.getAll().forEach((c) => {
    if (c.name.startsWith('sb-') || c.name === REMEMBER_COOKIE) {
      cookieStore.delete(c.name)
    }
  })

  console.log('[signOutAction] cleared session')
  redirect('/login?cleared=1')
}
