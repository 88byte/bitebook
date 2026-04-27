'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/cookies'

const SUPPORT_EMAIL = 'support@lastbite.pro'

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setRememberCookie(value: boolean) {
    if (typeof document === 'undefined') return
    const opts = `path=/; SameSite=Lax`
    if (value) {
      document.cookie = `${REMEMBER_COOKIE}=1; max-age=${REMEMBER_MAX_AGE}; ${opts}`
    } else {
      document.cookie = `${REMEMBER_COOKIE}=; max-age=0; ${opts}`
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setRememberCookie(remember)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(humanizeError(error.message))
      return
    }
    window.location.assign(next || '/app')
  }

  return (
    <form onSubmit={signInWithPassword} className="flex flex-col gap-3 w-full">
      <input
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="bb-input"
      />

      <input
        type="password"
        name="current-password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        className="bb-input"
      />

      <label className="flex items-center gap-2 text-xs select-none" style={{ color: 'var(--color-ink)' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-[color:var(--color-ink)]/30 accent-[color:var(--color-accent)]"
        />
        Remember me on this device
      </label>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="bb-cta mt-1"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="flex items-center justify-center text-xs pt-1">
        <Link
          href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          className="underline"
          style={{ color: 'var(--color-accent)', opacity: 0.85 }}
        >
          Forgot password?
        </Link>
      </div>
    </form>
  )
}

// Magic-link sign-in is intentionally retained but not surfaced in the UI.
// Kept as an exported helper so a future surface can re-enable the flow.
export async function sendMagicLink(email: string, next?: string) {
  const supabase = createClient()
  const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  })
}

function humanizeError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox.'
  if (/over.*rate/i.test(msg)) return 'Too many attempts. Try again in a minute.'
  return msg
}

export function HuntersInviteOnlyNote() {
  return (
    <p className="mt-5 text-center text-xs leading-relaxed" style={{ color: 'var(--color-ink)', opacity: 0.55 }}>
      Hunter? Bite Book is invite-only — ask your guide for an invite.{' '}
      <a href={`mailto:${SUPPORT_EMAIL}?subject=Bite%20Book%20support`} className="underline" style={{ color: 'var(--color-accent)', opacity: 0.85 }}>
        Contact us
      </a>{' '}
      with any questions.
    </p>
  )
}

export function GuideSignupNote() {
  return (
    <p className="mt-3 text-center text-xs" style={{ color: 'var(--color-ink)', opacity: 0.7 }}>
      New here?{' '}
      <Link href="/signup" className="underline font-semibold" style={{ color: 'var(--color-accent)' }}>
        Sign up as a guide
      </Link>{' '}
      — 7-day free trial, no card.
    </p>
  )
}
