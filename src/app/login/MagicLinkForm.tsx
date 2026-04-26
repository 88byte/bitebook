'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const SUPPORT_EMAIL = 'flaviod022@gmail.com'

export default function MagicLinkForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
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
          Check your email for the magic link
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
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
        className="w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-opacity disabled:opacity-40"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-paper)',
          fontFamily: 'var(--font-barlow-condensed)',
        }}
      >
        {loading ? 'Sending…' : 'Send me a magic link'}
      </button>
    </form>
  )
}

export function InviteOnlyNote() {
  return (
    <p className="mt-5 text-center text-xs leading-relaxed" style={{ color: 'var(--color-ink)', opacity: 0.55 }}>
      Bite Book is invite-only. Ask your guide for an invite, or{' '}
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=Bite%20Book%20guide%20signup`}
        className="underline"
        style={{ color: 'var(--color-accent)', opacity: 0.85 }}
      >
        contact us
      </a>{' '}
      if you&rsquo;re a guide signing up.
    </p>
  )
}
