'use client'

import { useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { wrapUpTripAction } from './actions'

// v26.3: Wrap up trip button + ConfirmModal. Replaces the bare-form Mark
// closed button on the trip detail page.
export default function WrapUpTripButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('trip_id', tripId)
      const res = await wrapUpTripAction(fd)
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
        <Lock size={14} aria-hidden="true" />
        Wrap up trip
      </button>
      <ConfirmModal
        open={open}
        title="Wrap up this trip?"
        body={
          <div>
            <p>Once finished, harvests and details lock. You can reopen it anytime if you need to add more.</p>
            {error && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem', marginTop: '0.5rem' }} role="alert">
                {error}
              </p>
            )}
          </div>
        }
        confirmLabel={pending ? 'Wrapping up...' : 'Finish trip'}
        cancelLabel="Keep it open"
        onConfirm={onConfirm}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
        isPending={pending}
      />
    </>
  )
}
