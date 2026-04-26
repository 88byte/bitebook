'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
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
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
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
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  )
}
