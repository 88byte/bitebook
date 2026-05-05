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
  // v27.4.3 — forward the pathname into the request so /app/layout.tsx
  // can read it via headers() and apply tier gating without re-parsing.
  // Set on the request before constructing supabaseResponse so RSC reads
  // pick it up.
  request.headers.set('x-bb-pathname', request.nextUrl.pathname)
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

  const { data: { user } } = await supabase.auth.getUser()

  // Protect /app routes
  if (!user && pathname.startsWith('/app')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname)
    return redirectWithCookies(url, supabaseResponse)
  }

  // v27.6.0 — /admin (Mission Control) edge gate. Belt-and-suspenders
  // alongside requireAdmin() in each page/action. Sends signed-out
  // users to /login with ?next=, and redirects signed-in non-admins
  // to /app rather than 404'ing at the edge — they shouldn't even
  // know /admin exists. The role check uses the cheap email match
  // here because pulling profile.role would mean a Supabase round
  // trip on every request.
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      url.searchParams.set('next', pathname)
      return redirectWithCookies(url, supabaseResponse)
    }
    const isAdminByEmail = (user.email ?? '').toLowerCase() === 'flaviod022@gmail.com'
    if (!isAdminByEmail) {
      const url = request.nextUrl.clone()
      url.pathname = '/app'
      url.search = ''
      return redirectWithCookies(url, supabaseResponse)
    }
  }

  // Already-signed-in users hitting /login or /signup — bounce them to the app
  // (or wherever ?next= points). Two important loop-breakers:
  //   1. If the URL carries ?error=, a downstream gate (e.g. requireGuide)
  //      sent them here. Bouncing back would loop. Render the page instead.
  //   2. Honor ?next= so post-login flows don't double-redirect.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    if (searchParams.has('error')) return supabaseResponse

    const next = searchParams.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
    const url = request.nextUrl.clone()
    url.pathname = safeNext
    url.search = ''
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
