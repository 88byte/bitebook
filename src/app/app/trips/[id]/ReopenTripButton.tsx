'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { reopenTripAction } from './actions'

// v26.3: Reopen a completed/canceled trip. Flips status back to 'active'.
export default function ReopenTripButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('trip_id', tripId)
      const res = await reopenTripAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        className="bb-cta-sm"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <RotateCcw size={14} aria-hidden="true" />
        Reopen trip
      </button>
      <ConfirmModal
        open={open}
        title="Reopen this trip?"
        body={
          <div>
            <p>Reopens the trip. You&rsquo;ll be able to add harvests and edit details again. Hunters will see it as active.</p>
            {error && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem', marginTop: '0.5rem' }} role="alert">
                {error}
              </p>
            )}
          </div>
        }
        confirmLabel={pending ? 'Reopening...' : 'Reopen'}
        cancelLabel="Keep finished"
        onConfirm={onConfirm}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
        isPending={pending}
      />
    </>
  )
}
