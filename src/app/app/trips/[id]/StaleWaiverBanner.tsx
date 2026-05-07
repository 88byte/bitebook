'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { bulkDeleteAndResendWaiverAction } from '../../_lib/waiver-sign'

// v27.9.8a.1.1 — post-replace stale-signature banner. Renders one tile
// per waiver doc on this trip that has been replaced AND has at least
// one hunter who signed the prior version. CTA fires the bulk
// delete-and-resend action server-side.
export default function StaleWaiverBanner({
  docId,
  tripId,
  label,
  staleCount,
}: {
  docId: string
  tripId: string
  label: string
  staleCount: number
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ deleted: number; sent: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await bulkDeleteAndResendWaiverAction(docId, tripId)
      setOpen(false)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setDone({ deleted: res.deleted, sent: res.sent })
    })
  }

  if (done) {
    return (
      <div
        className="bb-tile mt-3"
        style={{
          borderTop: '3px solid var(--color-copper)',
          padding: '0.75rem 1rem',
        }}
        role="status"
        aria-live="polite"
      >
        <p className="bb-form-help" style={{ margin: 0 }}>
          {label}: deleted {done.deleted} signature{done.deleted === 1 ? '' : 's'} and emailed{' '}
          {done.sent} hunter{done.sent === 1 ? '' : 's'} to re-sign.
        </p>
      </div>
    )
  }

  const hunterWord = staleCount === 1 ? 'hunter' : 'hunters'
  return (
    <>
      <div
        className="bb-tile mt-3"
        style={{
          borderTop: '3px solid var(--color-copper)',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
        role="alert"
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <AlertTriangle
            size={18}
            aria-hidden="true"
            style={{ color: 'var(--color-copper)', flexShrink: 0, marginTop: '0.15rem' }}
          />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-ink)' }}>
              {label} was updated
            </p>
            <p
              className="bb-form-help"
              style={{ margin: '0.25rem 0 0 0' }}
            >
              {staleCount} {hunterWord} signed the previous version. Delete and resend?
            </p>
            {error && (
              <p style={{ margin: '0.4rem 0 0 0', color: '#8C3C2A', fontSize: '0.78rem' }}>
                {error}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          className="bb-cta-sm"
          style={{ flexShrink: 0 }}
          onClick={() => setOpen(true)}
          disabled={isPending}
          aria-label={`Delete and resend ${label} for ${staleCount} ${hunterWord}`}
        >
          {isPending ? 'Working' : 'Delete and resend'}
        </button>
      </div>
      <ConfirmModal
        open={open}
        title={`Delete ${staleCount} signature${staleCount === 1 ? '' : 's'} and resend?`}
        body={`Delete ${staleCount} signature${staleCount === 1 ? '' : 's'} for ${label} and email all hunters to re-sign? This can't be undone.`}
        confirmLabel="Delete and resend"
        cancelLabel="Cancel"
        destructive
        isPending={isPending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
