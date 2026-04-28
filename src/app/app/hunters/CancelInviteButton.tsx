'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { cancelInviteAction } from './actions'

// v25.7: icon-only secondary action that soft-cancels a pending invite.
// Confirms via window.confirm() to keep the UX simple — once confirmed the
// server action flips status to 'canceled' and the row falls out of the
// Pending list on the next revalidation.
export default function CancelInviteButton({
  inviteId,
  email,
}: {
  inviteId: string
  email: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [showCanceledPill, setShowCanceledPill] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Auto-clear the "Canceled" pill after 4s. Page revalidation should remove
  // the row anyway, but the pill covers the brief window before it does.
  useEffect(() => {
    if (!showCanceledPill) return
    const id = setTimeout(() => setShowCanceledPill(false), 4000)
    return () => clearTimeout(id)
  }, [showCanceledPill])

  function onClick() {
    setError(null)
    const ok = window.confirm(
      `Cancel this invite to ${email}? They won't be able to register from the link anymore.`,
    )
    if (!ok) return
    const fd = new FormData()
    fd.set('invite_id', inviteId)
    startTransition(async () => {
      const res = await cancelInviteAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setShowCanceledPill(true)
    })
  }

  const buttonTitle = `Cancel invite to ${email}`

  return (
    <div className="flex flex-col items-end gap-1">
      {showCanceledPill ? (
        <span
          className="bb-pill bb-pill-active"
          role="status"
          aria-live="polite"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Check size={12} aria-hidden="true" />
          Canceled
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="bb-btn-secondary"
          aria-label={buttonTitle}
          title={buttonTitle}
          style={{ padding: '0.4rem 0.55rem' }}
        >
          <X size={16} aria-hidden="true" />
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
