'use client'

import { useState } from 'react'
import { Mail, User, Lock, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    if (!displayName.trim()) return setError('Please enter your name.')
    setLoading(true)

    const res = await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, displayName: displayName.trim() }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Something went wrong.' }))
      setLoading(false)
      setError(error || 'Something went wrong.')
      return
    }

    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      setLoading(false)
      setError('Account created but sign-in failed. Try signing in from the home page.')
      return
    }
    window.location.assign('/app')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <label className="bb-field">
        <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
        <input
          type="email"
          value={email}
          readOnly
          aria-label="Email address"
          className="bb-input bb-input-iconed"
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-icon"><User size={18} aria-hidden="true" /></span>
        <input
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className="bb-input bb-input-iconed"
        />
      </label>
      <label className="bb-field">
        <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
        <input
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
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
      <label className="bb-field">
        <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
        <input
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          aria-label="Confirm password"
          className="bb-input bb-input-iconed"
        />
      </label>
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={loading} className="bb-cta mt-1">
        {loading ? 'Creating account…' : 'Create my account'}
      </button>
    </form>
  )
}
