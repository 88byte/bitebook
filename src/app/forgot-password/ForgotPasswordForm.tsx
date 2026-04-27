'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
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
      <div className="flex flex-col items-center text-center py-2">
        <div className="mb-3" style={{ color: 'var(--color-copper)' }}>
          <Mail size={36} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <p className="font-bold text-sm" style={{ color: 'var(--color-ink)' }}>
          Check your email
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>
          We sent a password-reset link to <strong>{email}</strong>. The link is good for 60 minutes.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <label className="bb-field">
        <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          className="bb-input bb-input-iconed"
        />
      </label>
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={loading || !email} className="bb-cta mt-1">
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}
