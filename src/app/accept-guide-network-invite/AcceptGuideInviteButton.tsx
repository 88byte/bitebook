'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { acceptOutfitterGuideInviteAction } from '../app/network/actions'

// v28.1.0e.2 — Accept CTA branches on the new `subscription_required`
// code. If the signed-in caller does NOT have an active personal guide
// sub, we route them to /app/settings?tab=billing to subscribe; they
// come back to this link to finish accepting. The token is preserved
// in the return URL so they can click back through.
export default function AcceptGuideInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [subRequired, setSubRequired] = useState(false)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    setSubRequired(false)
    startTransition(async () => {
      const res = await acceptOutfitterGuideInviteAction(token)
      if ('error' in res) {
        if (res.code === 'subscription_required') {
          setSubRequired(true)
          return
        }
        setError(res.error)
        return
      }
      router.replace('/app')
      router.refresh()
    })
  }

  const returnUrl = `/accept-guide-network-invite?token=${encodeURIComponent(token)}`
  const billingHref = `/app/settings?tab=billing&return_to=${encodeURIComponent(returnUrl)}`

  return (
    <div>
      {!subRequired ? (
        <button
          type="button"
          className="bb-cta-sm"
          onClick={onClick}
          disabled={pending}
          style={{ minHeight: 44 }}
        >
          {pending ? 'Accepting...' : 'Accept invite'}
        </button>
      ) : (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 10,
            background: 'rgba(168, 92, 50, 0.10)',
            border: '1px solid rgba(168, 92, 50, 0.25)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Subscription needed</p>
          <p className="bb-form-help" style={{ margin: '0.35rem 0 0.75rem' }}>
            Joining a guide network needs a Bite Book Guide subscription ($9/mo, 7-day free trial). Add yours, then come back here to accept.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href={billingHref} className="bb-cta-sm" style={{ minHeight: 44 }}>
              Add subscription
            </Link>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={() => setSubRequired(false)}
              style={{ minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}
    </div>
  )
}
