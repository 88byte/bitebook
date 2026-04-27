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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <input
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        aria-label="New password"
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
        {loading ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
