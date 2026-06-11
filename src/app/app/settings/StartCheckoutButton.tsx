'use client'

import { useState } from 'react'

// v28.1.0e.3 — Client button that calls /api/start-existing-user-checkout
// for the signed-in user. Used by BillingPanel when the user has no
// sub row (the prior dead-end "email support" branch). When a network
// invite triggered the upgrade, returnTo + networkToken are passed
// through so the webhook can auto-accept the invite and Stripe's
// success_url returns the visitor straight to the invite link.
export default function StartCheckoutButton({
  plan,
  returnTo,
  networkToken,
  label,
  variant = 'primary',
}: {
  plan: 'monthly' | 'annual'
  returnTo: string | null
  networkToken: string | null
  label: string
  variant?: 'primary' | 'secondary'
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/start-existing-user-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          return_to: returnTo,
          network_token: networkToken,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Could not start checkout.' }))
        setError(data.error || 'Could not start checkout.')
        setPending(false)
        return
      }
      const data = await res.json()
      if (data?.url) {
        window.location.assign(data.url)
        return
      }
      setError('Stripe did not return a checkout URL.')
      setPending(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        className={variant === 'primary' ? 'bb-cta-sm' : 'bb-btn-secondary'}
        onClick={onClick}
        disabled={pending}
        style={{ minHeight: 44 }}
      >
        {pending ? 'Loading...' : label}
      </button>
      {error && (
        <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}
    </div>
  )
}
