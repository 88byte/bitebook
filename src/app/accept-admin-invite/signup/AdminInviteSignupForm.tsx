'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signupAndAcceptOutfitterAdminInviteAction } from '../../app/settings/team-actions'

// v28.1.0c.2 — Free-signup form for outfitter admin invitees.
// Mirrors the hunter accept-invite client pattern: server action
// creates the account + flips the tier, then we sign the new user
// in via signInWithPassword and land them on /app.
export default function AdminInviteSignupForm({
  token,
  invitedEmail,
  orgName,
}: {
  token: string
  invitedEmail: string
  orgName: string
}) {
  const [email, setEmail] = useState(invitedEmail)
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await signupAndAcceptOutfitterAdminInviteAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Sign the new user in client-side so the cookie session lands,
      // then redirect to /app where the outfitter dashboard renders.
      const sb = createClient()
      const { error: signInErr } = await sb.auth.signInWithPassword({
        email: res.email,
        password,
      })
      if (signInErr) {
        setError(
          `Account created but sign-in failed (${signInErr.message}). Try signing in from the home page.`,
        )
        return
      }
      window.location.assign('/app')
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="display_name">Full name</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          className="bb-input"
          required
          autoComplete="name"
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="bb-input"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
        />
        <p className="bb-form-help">
          We pre-filled this from your invite. You can change it if needed.
        </p>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          className="bb-input"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="bb-form-help">
          At least 8 characters.{' '}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="bb-text-action"
            style={{ display: 'inline', padding: 0 }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </p>
      </div>

      {error && (
        <p role="alert" className="bb-form-help" style={{ color: '#A33D3D' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className="bb-cta-sm"
        disabled={pending}
        style={{ marginTop: '0.5rem', minHeight: 44 }}
      >
        {pending ? 'Creating account…' : `Join ${orgName} as admin`}
      </button>

      <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
        Admin access is free, covered by your outfitter's subscription. If you also lead trips
        yourself later, you can add a guide subscription from Settings.
      </p>
    </form>
  )
}
