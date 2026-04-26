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
    <Card>
      <form onSubmit={signInWithPassword} className="flex flex-col gap-3 w-full">
        <Field
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          ariaLabel="Email"
        />

        <Field
          type="password"
          name="current-password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          placeholder="Password"
          ariaLabel="Password"
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

        {error && (
          <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-paper)',
            fontFamily: 'var(--font-barlow-condensed)',
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex items-center justify-between text-xs pt-1">
          <Link
            href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
            className="underline"
            style={{ color: 'var(--color-accent)', opacity: 0.85 }}
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </Card>
  )
}

// Magic-link sign-in is intentionally retained but not surfaced in the UI.
// Flavio asked to keep the option open for later; calling this from a future
// UI surface is enough to re-enable the flow.
export async function sendMagicLink(email: string, next?: string) {
  const supabase = createClient()
  const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  })
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 backdrop-blur-sm"
      style={{
        background: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(31,36,25,0.08)',
        boxShadow: '0 1px 2px rgba(31,36,25,0.04), 0 8px 24px -12px rgba(31,36,25,0.18)',
      }}
    >
      {children}
    </div>
  )
}

function Field(props: {
  type: string
  name: string
  autoComplete: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
}) {
  return (
    <input
      type={props.type}
      name={props.name}
      autoComplete={props.autoComplete}
      required={props.required}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      className="w-full rounded-xl px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]"
      style={{
        background: 'white',
        border: '1px solid rgba(31,36,25,0.15)',
        color: 'var(--color-ink)',
      }}
    />
  )
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
