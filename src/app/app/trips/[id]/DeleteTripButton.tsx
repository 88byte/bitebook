'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { deleteTripAction } from './actions'

// v27.9.3 — permanent trip delete. Distinct from CancelTripButton
// (status='canceled', row preserved for history). This action removes
// the trip row entirely; FK CASCADE on every trip-keyed table cleans
// up harvest logs/entries, participants, trip_docs, generated logs,
// invitations, etc. Server action also nukes the bb-private storage
// files for any generated PDFs (best-effort).
//
// Type-to-confirm guard: user must type the trip title (case-
// insensitive trim). ConfirmModal already has this gate built in.
// Server action re-validates the title match as defense-in-depth.
//
// On success: route to /app/trips since the current detail page
// would 404 on refresh.
export default function DeleteTripButton({
  tripId,
  tripTitle,
}: {
  tripId: string
  tripTitle: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('trip_id', tripId)
      fd.set('confirm_title', tripTitle)
      const res = await deleteTripAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Trip is gone — bounce to the list before the cached detail
      // 404s on refresh.
      router.replace('/app/trips?deleted=1')
    })
  }

  return (
    <>
      <button
        type="button"
        className="bb-cta-sm bb-cta-sm-destructive"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete trip
      </button>
      <ConfirmModal
        open={open}
        title="Delete this trip permanently?"
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p>
              This deletes the trip, all harvest logs and entries, trip
              participants, linked wallet items, attached docs, generated
              report PDFs, and any invitations. <strong>This cannot be
              undone.</strong>
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
              Hunters keep their own license / tag wallet items — only
              the trip-specific links are removed.
            </p>
            {error && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">
                {error}
              </p>
            )}
          </div>
        }
        confirmLabel={pending ? 'Deleting…' : 'Delete forever'}
        cancelLabel="Cancel"
        destructive
        typeToConfirm={tripTitle}
        onConfirm={onConfirm}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
        isPending={pending}
      />
    </>
  )
}
