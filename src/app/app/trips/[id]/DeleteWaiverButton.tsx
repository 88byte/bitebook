'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { deleteWaiverSignatureAction } from '../../_lib/waiver-sign'

// v27.9.8a.1.1 — guide-side DELETE of a hunter's signed waiver. Renamed
// from ResetWaiverButton (v27.9.8a.1) per Flavio: "I didn't ask for a
// reset. I asked for a delete and the ability to resend one on their
// end especially if the guide needs to upload and updated waiver."
//
// Confirm → server action verifies trip ownership, removes the signed
// PDF from bb-private (admin client), inserts a doc_signatures audit
// row with action='deleted', then nulls completed_at + completed_data
// on the action row so the hunter sees the waiver back as Pending.
export default function DeleteWaiverButton({
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
      const res = await deleteWaiverSignatureAction(actionId)
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
        aria-label={`Delete ${hunterName}'s ${waiverLabel} signature`}
        title={`Delete ${hunterName}'s ${waiverLabel} signature`}
      >
        <Trash2 size={12} aria-hidden="true" />
        {isPending ? 'Deleting' : 'Delete'}
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
        title="Delete signed waiver?"
        body={`Delete ${hunterName}'s ${waiverLabel} signature? The signed PDF will be removed.`}
        confirmLabel="Delete waiver"
        cancelLabel="Cancel"
        destructive
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
