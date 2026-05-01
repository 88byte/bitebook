'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RotateCcw, Archive } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  updateDocAction,
  archiveDocAction,
  restoreDocAction,
  deleteDocAction,
  type DocKind,
} from '../../_lib/docs-actions'

const KIND_OPTIONS: { value: DocKind; label: string }[] = [
  { value: 'waiver',   label: 'Waiver' },
  { value: 'log',      label: 'Harvest log' },
  { value: 'resource', label: 'Resource' },
]

export default function EditDocForm({
  docId,
  initial,
  isArchived,
  canHardDelete,
  tripCount,
}: {
  docId: string
  initial: { kind: DocKind; label: string; state: string | null }
  isArchived: boolean
  canHardDelete: boolean
  tripCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [kind, setKind] = useState<DocKind>(initial.kind)
  const [label, setLabel] = useState(initial.label)
  const [state, setState] = useState(initial.state ?? '')

  const [confirmMode, setConfirmMode] = useState<null | 'archive' | 'delete'>(null)

  const showState = kind === 'waiver' || kind === 'log'

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    setSavedAt(null)
    if (!label.trim()) {
      setError('Label is required.')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('doc_id', docId)
      fd.set('kind', kind)
      fd.set('label', label.trim())
      if (state) fd.set('state', state)
      const res = await updateDocAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

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
      <form onSubmit={onSubmit} className="flex flex-col gap-4 bb-form-narrow">
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Details</h2>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="edit_kind">Kind</label>
              <select
                id="edit_kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as DocKind)}
                className="bb-input"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              {kind !== initial.kind && (
                <p className="bb-form-help">
                  Changing kind resets the mapping status. Any field or signature mappings will need to be re-done.
                </p>
              )}
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="edit_label">Label</label>
              <input
                id="edit_label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bb-input"
                maxLength={200}
                required
              />
            </div>
            {showState && (
              <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
                <label className="bb-form-label" htmlFor="edit_state">
                  State <span style={{ opacity: 0.6 }}>(optional)</span>
                </label>
                <select
                  id="edit_state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="bb-input"
                >
                  <option value="">— Not state-specific —</option>
                  {US_STATES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {error && (
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bb-cta-sm" disabled={pending}>
            {pending ? 'Saving…' : savedAt !== null ? 'Saved' : 'Save changes'}
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
              className="bb-cta-sm-destructive"
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
        </div>
      </form>

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
