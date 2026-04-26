'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MagicLinkForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    // Resolve next param
    const { next } = await searchParams
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: 'white', border: '1px solid rgba(31,36,25,0.08)' }}
      >
        <div className="text-3xl mb-3">📬</div>
        <p className="font-bold text-sm" style={{ color: 'var(--color-ink)' }}>
          Check your email
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
          We sent a sign-in link to <strong>{email}</strong>
        </p>
        <button
          onClick={() => { setSent(false); setEmail('') }}
          className="mt-4 text-xs underline"
          style={{ color: 'var(--color-accent)' }}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-xs font-bold" style={{ color: 'var(--color-ink)' }}>
        Email address
      </label>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl px-4 py-3 text-sm outline-none"
        style={{
          background: 'white',
          border: '1px solid rgba(31,36,25,0.15)',
          color: 'var(--color-ink)',
        }}
      />
      {error && (
        <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !email}
        className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-40"
        style={{ background: 'var(--color-accent)', color: 'var(--color-paper)' }}
      >
        {loading ? 'Sending…' : 'Send sign-in link'}
      </button>
    </form>
  )
}
