'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptOutfitterGuideInviteAction } from '../app/network/actions'

// v28.1.0e.0 — Client-side accept CTA for guide network invites.
export default function AcceptGuideInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await acceptOutfitterGuideInviteAction(token)
      if ('error' in res) {
        setError(res.error)
        return
      }
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
        {pending ? 'Accepting...' : 'Accept invite'}
      </button>
      {error && (
        <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}
    </div>
  )
}
