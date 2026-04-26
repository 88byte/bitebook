'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <Card>
        <div className="text-3xl mb-3 text-center">📬</div>
        <p className="font-bold text-sm text-center" style={{ color: 'var(--color-ink)' }}>
          Check your email
        </p>
        <p className="text-xs mt-1 text-center" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
          We sent a password-reset link to <strong>{email}</strong>. The link is good for 60 minutes.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          style={{ background: 'white', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)' }}
        />
        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !email}
          className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)', fontFamily: 'var(--font-barlow-condensed)' }}
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </Card>
  )
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
