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

    // Server creates the user (admin), accepts the invite, returns nothing on success.
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

    // User now exists. Sign them in client-side so cookies land in the browser, then bounce to /app.
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
    <div
      className="rounded-2xl p-6 backdrop-blur-sm"
      style={{
        background: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(31,36,25,0.08)',
        boxShadow: '0 1px 2px rgba(31,36,25,0.04), 0 8px 24px -12px rgba(31,36,25,0.18)',
      }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          readOnly
          aria-label="Email"
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={{ background: 'rgba(31,36,25,0.05)', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)', opacity: 0.7 }}
        />
        <input
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          style={{ background: 'white', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)' }}
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
          className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          style={{ background: 'white', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)' }}
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
          className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          style={{ background: 'white', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)' }}
        />
        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)', fontFamily: 'var(--font-barlow-condensed)' }}
        >
          {loading ? 'Creating account…' : 'Create my account'}
        </button>
      </form>
    </div>
  )
}
