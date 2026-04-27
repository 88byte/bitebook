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
      <div className="flex flex-col items-center text-center">
        <div className="mb-3" style={{ color: 'var(--color-accent)' }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </div>
        <p className="font-bold text-sm" style={{ color: 'var(--color-ink)' }}>
          Check your email
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
          We sent a password-reset link to <strong>{email}</strong>. The link is good for 60 minutes.
        </p>
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
        aria-label="Email"
        className="bb-input"
      />
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={loading || !email} className="bb-cta mt-1">
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}
