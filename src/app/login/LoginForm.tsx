'use client'

import { useActionState, useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react'
import { signInAction, type SignInState } from './actions'

export default function LoginForm({
  next,
  initialError,
}: {
  next?: string
  initialError?: string | null
}) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInAction,
    initialError ? { error: initialError } : null
  )
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-3 w-full">
      <input type="hidden" name="next" value={next ?? '/app'} />

      <label className="bb-field">
        <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="Email address"
          aria-label="Email address"
          className="bb-input bb-input-iconed"
        />
      </label>

      <label className="bb-field">
        <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
        <input
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          required
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
          <input type="checkbox" name="remember" defaultChecked />
          <Check size={14} strokeWidth={3} className="bb-check-mark" aria-hidden="true" />
        </span>
        Remember me on this device
      </label>

      {state?.error && (
        <div
          role="alert"
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bb-cta mt-2"
        aria-busy={pending}
      >
        {pending ? (
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
