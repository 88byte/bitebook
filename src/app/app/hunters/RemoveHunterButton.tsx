'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Trash2 } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { removeHunterAction } from './actions'

// v25.9: removes an accepted hunter from the guide's network. Confirms via
// the branded ConfirmModal (destructive variant) — past trip records remain
// untouched, the guide can re-invite the hunter later.
export default function RemoveHunterButton({
  inviteId,
  displayName,
  email,
}: {
  inviteId: string
  displayName: string | null
  email: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [showRemovedPill, setShowRemovedPill] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!showRemovedPill) return
    const id = setTimeout(() => setShowRemovedPill(false), 4000)
    return () => clearTimeout(id)
  }, [showRemovedPill])

  function onClick() {
    setError(null)
    setOpen(true)
  }

  function onConfirm() {
    const fd = new FormData()
    fd.set('invite_id', inviteId)
    startTransition(async () => {
      const res = await removeHunterAction(fd)
      setOpen(false)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setShowRemovedPill(true)
    })
  }

  const label = displayName ?? email
  const buttonTitle = `Remove ${label} from your network`

  return (
    <div className="flex flex-col items-end gap-1">
      {showRemovedPill ? (
        <span
          className="bb-pill bb-pill-active"
          role="status"
          aria-live="polite"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Check size={12} aria-hidden="true" />
          Removed
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="bb-text-action bb-text-action-copper"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}
          aria-label={buttonTitle}
          title={buttonTitle}
        >
          <Trash2 size={14} aria-hidden="true" />
          {isPending ? 'Removing' : 'Remove'}
        </button>
      )}
      {error && (
        <span style={{ color: '#8C3C2A', fontSize: '0.7rem' }} role="alert">
          {error}
        </span>
      )}
      <ConfirmModal
        open={open}
        title="Remove from network?"
        body={`Remove ${label} from your network? They'll lose access to upcoming trips with you. Past trip records remain. You can invite them again later.`}
        confirmLabel="Remove"
        cancelLabel="Keep in network"
        destructive
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
