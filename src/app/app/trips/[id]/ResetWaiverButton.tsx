'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { resetWaiverSignatureAction } from '../../_lib/waiver-sign'

// v27.9.8a.1 — guide-side reset of a hunter's signed waiver. Mirrors
// the RemoveHunterButton + CancelInviteButton ConfirmModal pattern.
// Confirm → server action verifies trip ownership, removes the signed
// PDF from bb-private (admin client), nulls completed_at +
// completed_data on the action row so the hunter sees the waiver back
// as Pending. Original doc_signatures audit row stays as immutable
// history (no schema change).
export default function ResetWaiverButton({
  actionId,
  hunterName,
  waiverLabel,
}: {
  actionId: string
  hunterName: string
  waiverLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    setError(null)
    setOpen(true)
  }

  function onConfirm() {
    startTransition(async () => {
      const res = await resetWaiverSignatureAction(actionId)
      setOpen(false)
      if ('error' in res) {
        setError(res.error)
        return
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="bb-text-action bb-text-action-copper"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 700,
        }}
        aria-label={`Reset ${hunterName}'s ${waiverLabel} signature`}
        title={`Reset ${hunterName}'s ${waiverLabel} signature`}
      >
        <RotateCcw size={12} aria-hidden="true" />
        {isPending ? 'Resetting' : 'Reset'}
      </button>
      {error && (
        <span
          role="alert"
          style={{ color: '#8C3C2A', fontSize: '0.7rem', marginLeft: '0.4rem' }}
        >
          {error}
        </span>
      )}
      <ConfirmModal
        open={open}
        title="Reset signed waiver?"
        body={`Reset ${hunterName}'s ${waiverLabel} signature? They'll need to sign again.`}
        confirmLabel="Reset waiver"
        cancelLabel="Cancel"
        destructive
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
