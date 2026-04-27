'use client'

import { useState, useTransition } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { resendInviteAction } from './actions'

export default function ResendInviteButton({
  inviteId,
  email,
}: {
  inviteId: string
  email: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    const fd = new FormData()
    fd.set('invite_id', inviteId)
    startTransition(async () => {
      const res = await resendInviteAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSentAt(Date.now())
    })
  }

  const showSent = sentAt !== null && Date.now() - sentAt < 4000

  return (
    <div className="flex flex-col items-end gap-1">
      {showSent ? (
        <span
          className="bb-pill bb-pill-active"
          role="status"
          aria-live="polite"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Check size={12} aria-hidden="true" />
          Resent
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="bb-btn-secondary"
          aria-label={`Resend invite to ${email}`}
          title={`Resend invite to ${email}`}
          style={{ padding: '0.4rem 0.55rem' }}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      )}
      {error && (
        <span style={{ color: '#8C3C2A', fontSize: '0.7rem' }} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
