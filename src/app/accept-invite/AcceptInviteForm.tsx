'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
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
      <input
        type="email"
        value={email}
        readOnly
        aria-label="Email"
        className="bb-input"
      />
      <input
        type="text"
        autoComplete="name"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        className="bb-input"
      />
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        className="bb-input"
      />
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        aria-label="Confirm password"
        className="bb-input"
      />
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={loading} className="bb-cta mt-1">
        {loading ? 'Creating account…' : 'Create my account'}
      </button>
    </form>
  )
}
