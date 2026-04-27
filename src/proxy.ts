import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { applyRememberPreference, REMEMBER_COOKIE } from '@/lib/cookies'

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
])

// Wraps NextResponse.redirect so any cookies Supabase wrote to `supabaseResponse`
// during getUser()'s token rotation also land on the redirect — without this,
// rotated access tokens are silently dropped on every redirect. Canonical
// pitfall flagged in the @supabase/ssr docs.
function redirectWithCookies(url: URL, supabaseResponse: NextResponse) {
  const redirect = NextResponse.redirect(url)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie)
  })
  return redirect
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === '1'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, applyRememberPreference(options, remember))
          )
        },
      },
    }
  )

  const { pathname, searchParams } = request.nextUrl

  // Diagnostic logs (v19) — tail in Vercel runtime logs to trace the auth
  // chain hop-by-hop. Names only, never values, so no token leakage.
  const incomingCookieNames = request.cookies.getAll().map((c) => c.name)
  const sbCookies = incomingCookieNames.filter((n) => n.startsWith('sb-'))
  console.log('[proxy] request', {
    path: pathname,
    search: request.nextUrl.search || '',
    sbCookieCount: sbCookies.length,
    sbCookies,
    hasRemember: incomingCookieNames.includes(REMEMBER_COOKIE),
  })

  const { data: { user }, error: getUserErr } = await supabase.auth.getUser()
  console.log('[proxy] getUser', {
    path: pathname,
    hasUser: !!user,
    userId: user?.id ?? null,
    error: getUserErr ? { code: getUserErr.code, status: getUserErr.status, message: getUserErr.message } : null,
  })

  // Protect /app routes
  if (!user && pathname.startsWith('/app')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname)
    console.log('[proxy] redirect', { from: pathname, to: '/login', reason: 'no_user_on_app' })
    return redirectWithCookies(url, supabaseResponse)
  }

  // Already-signed-in users hitting /login or /signup — bounce them to the app
  // (or wherever ?next= points). Two important loop-breakers:
  //   1. If the URL carries ?error=, a downstream gate (e.g. requireGuide)
  //      sent them here. Bouncing back would loop. Render the page instead.
  //   2. Honor ?next= so post-login flows don't double-redirect.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    if (searchParams.has('error')) {
      console.log('[proxy] no-bounce', { path: pathname, reason: 'has_error_param' })
      return supabaseResponse
    }

    const next = searchParams.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
    const url = request.nextUrl.clone()
    url.pathname = safeNext
    url.search = ''
    console.log('[proxy] redirect', { from: pathname, to: safeNext, reason: 'signed_in_on_login' })
    return redirectWithCookies(url, supabaseResponse)
  }

  return supabaseResponse
}

// Run on every route except framework + static asset requests.
// Keeping PUBLIC_ROUTES around so future logic (e.g. role gating) has a single source of truth.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|icon|apple-touch|sw\\.js|manifest\\.webmanifest|api/stripe/webhook).*)',
  ],
}

export { PUBLIC_ROUTES }
