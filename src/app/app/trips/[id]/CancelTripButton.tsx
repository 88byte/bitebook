'use client'

import { useState, useTransition } from 'react'
import { Ban } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { cancelTripAction } from './actions'

// v27.0b.7: Cancel-trip button. For trips that DIDN'T happen (planned or
// active that fell through). Sets status='canceled'. Distinct from
// wrapUpTripAction which is for trips that completed normally.
//
// Visible on /app/trips/[id] when trip.status === 'planned' or 'active'.
// Server action (cancelTripAction) refuses on already-closed trips so
// this button + the wrap-up button can coexist without state confusion.
export default function CancelTripButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('trip_id', tripId)
      const res = await cancelTripAction(fd)
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
        className="bb-btn-secondary"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <Ban size={14} aria-hidden="true" />
        Cancel trip
      </button>
      <ConfirmModal
        open={open}
        title="Cancel this trip?"
        body={
          <div>
            <p>It&rsquo;ll stop appearing in upcoming. You can still see it in your trip history.</p>
            {error && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem', marginTop: '0.5rem' }} role="alert">
                {error}
              </p>
            )}
          </div>
        }
        confirmLabel={pending ? 'Canceling…' : 'Cancel trip'}
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
        isPending={pending}
      />
    </>
  )
}
