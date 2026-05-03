'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, RotateCcw, Save, Trash2 } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  archiveDocAction,
  restoreDocAction,
  deleteDocAction,
} from '../../_lib/docs-actions'

// v27.1.1.0.3d.2.6: doc detail action bar promoted to the top of the
// page (matches the trip-detail pattern from v27.0b.9.1). Save changes
// is the primary copper CTA and submits the editable details form below
// via the HTML `form="edit-doc-form"` attribute — no shared state needed.
// Archive / Restore / Delete are independent server actions handled
// inline with their own confirm modals.

export default function DocActionsBar({
  docId,
  isArchived,
  canHardDelete,
  tripCount,
}: {
  docId: string
  isArchived: boolean
  canHardDelete: boolean
  tripCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmMode, setConfirmMode] = useState<null | 'archive' | 'delete'>(null)

  function runArchive() {
    setError(null)
    startTransition(async () => {
      const res = await archiveDocAction(docId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function runRestore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreDocAction(docId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function runHardDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteDocAction(docId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push('/app/docs')
      router.refresh()
    })
  }

  return (
    <>
      <div
        className="bb-tile mt-3"
        style={{
          padding: '0.75rem 1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <button
          type="submit"
          form="edit-doc-form"
          className="bb-cta-sm"
          disabled={pending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Save size={14} aria-hidden="true" />
          Save changes
        </button>

        {!isArchived ? (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setConfirmMode('archive')}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Archive size={14} aria-hidden="true" />
            Archive
          </button>
        ) : (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={runRestore}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Restore
          </button>
        )}

        {isArchived && (
          <button
            type="button"
            className="bb-cta-sm bb-cta-sm-destructive"
            onClick={() => setConfirmMode('delete')}
            disabled={pending || !canHardDelete}
            title={
              canHardDelete
                ? 'Permanently delete this doc.'
                : `Can't delete — still attached to ${tripCount} trip${tripCount === 1 ? '' : 's'}.`
            }
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete forever
          </button>
        )}

        {error && (
          <p
            className="bb-form-help"
            role="alert"
            style={{ margin: 0, flexBasis: '100%', color: '#8C3C2A' }}
          >
            {error}
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirmMode === 'archive'}
        title="Archive this doc?"
        body="It will disappear from your library, but trips that reference it will keep working. You can restore it any time."
        confirmLabel="Archive"
        destructive
        isPending={pending}
        onCancel={() => setConfirmMode(null)}
        onConfirm={() => {
          setConfirmMode(null)
          runArchive()
        }}
      />
      <ConfirmModal
        open={confirmMode === 'delete'}
        title="Delete this doc forever?"
        body="The PDF and its mappings will be permanently removed. This can't be undone."
        confirmLabel="Delete forever"
        destructive
        typeToConfirm="DELETE"
        isPending={pending}
        onCancel={() => setConfirmMode(null)}
        onConfirm={() => {
          setConfirmMode(null)
          runHardDelete()
        }}
      />
    </>
  )
}
