'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptOutfitterAdminInviteAction } from '../app/settings/team-actions'

// v28.1.0c — Client-side accept CTA. Pulls in the server action,
// runs it inside a transition, and redirects to /app on success.
export default function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await acceptOutfitterAdminInviteAction(token)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Refresh so /app picks up the new tier; outfitter dashboard variant renders.
      router.replace('/app')
      router.refresh()
    })
  }

  return (
    <div>
      <button
        type="button"
        className="bb-cta-sm"
        onClick={onClick}
        disabled={pending}
        style={{ minHeight: 44 }}
      >
        {pending ? 'Accepting…' : 'Accept invite'}
      </button>
      {error && (
        <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}
    </div>
  )
}
