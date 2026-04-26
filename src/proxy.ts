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

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Protect /app routes
  if (!user && pathname.startsWith('/app')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Already-signed-in users hitting login/signup go straight to the app
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
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
