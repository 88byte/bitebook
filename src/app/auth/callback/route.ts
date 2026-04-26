import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Handles all Supabase email-link landings: magic-link sign-in, password reset,
// invite confirmation. Trades the URL `code` for a server session, then bounces
// the user to `next` (defaults to /app).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Only allow same-origin redirects
      const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/app'
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
