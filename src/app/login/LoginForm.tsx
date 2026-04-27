'use client'

import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/cookies'

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      <label className="bb-field">
        <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          className="bb-input bb-input-iconed"
        />
      </label>

      <label className="bb-field">
        <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
        <input
          type={showPassword ? 'text' : 'password'}
          name="current-password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="bb-input bb-input-iconed bb-input-actioned"
        />
        <button
          type="button"
          className="bb-field-action"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>

      <label className="bb-check-row mt-1">
        <span className="bb-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <Check size={14} strokeWidth={3} className="bb-check-mark" aria-hidden="true" />
        </span>
        Remember me on this device
      </label>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="bb-cta mt-2"
        aria-busy={loading}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={18} className="bb-spin" aria-hidden="true" />
            Signing in…
          </span>
        ) : (
          'Sign in'
        )}
      </button>
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
