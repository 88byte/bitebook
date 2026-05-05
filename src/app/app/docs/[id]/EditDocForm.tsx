'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { US_STATES } from '@/lib/us-states'
import {
  updateDocAction,
  type DocKind,
} from '../../_lib/docs-actions'
import MappingStatusBadge from '../../_components/MappingStatusBadge'

// v27.1.1.0.3d.2.6: action buttons (Save / Archive / Restore / Delete)
// were promoted to a top-of-page DocActionsBar. The Save button there
// targets THIS form via `form="edit-doc-form"` so no shared state is
// needed — the browser dispatches a native submit event and our
// onSubmit handler runs as before. Saved/error feedback stays inline
// here, just below the fields.

const KIND_OPTIONS: { value: DocKind; label: string }[] = [
  { value: 'waiver',   label: 'Waiver' },
  { value: 'log',      label: 'Harvest log' },
  { value: 'resource', label: 'Resource' },
]

export default function EditDocForm({
  docId,
  initial,
  // v27.3.10.5 item 1: Field mapping configuration block lives inside
  // the same window as the doc metadata fields, immediately under the
  // State (optional) row. Pass these props to surface the section.
  // Resource docs (mapping not applicable) get null/undefined and
  // no section renders.
  mappingStatus,
  isArchived = false,
  showSetSignatureButton = false,
  viewerOwnsDoc = true,
}: {
  docId: string
  initial: { kind: DocKind; label: string; state: string | null }
  mappingStatus?: string
  isArchived?: boolean
  showSetSignatureButton?: boolean
  viewerOwnsDoc?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [kind, setKind] = useState<DocKind>(initial.kind)
  const [label, setLabel] = useState(initial.label)
  const [state, setState] = useState(initial.state ?? '')

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

  return (
    <form
      id="edit-doc-form"
      onSubmit={onSubmit}
      className="flex flex-col gap-4 bb-form-narrow"
    >
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

          {/* v27.3.10.5 item 1: Field mapping configuration block,
              promoted into this same tile so doc metadata + mapping
              setup live in one window. Renders for log + waiver kinds
              only (resource docs don't have a mapping). The block sits
              under State (optional) with a subtle divider above. */}
          {showState && mappingStatus && (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--color-card-divider)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.4rem',
                }}
              >
                <h2 className="bb-form-section-head" style={{ marginTop: 0, marginBottom: 0 }}>
                  Field mapping
                </h2>
                <MappingStatusBadge status={mappingStatus} archived={isArchived} />
              </div>
              <p className="bb-form-help" style={{ margin: 0 }}>
                {viewerOwnsDoc
                  ? 'Match each PDF box to a Bite Book data source so the auto-fill engine knows what to write into your reports. AI can pre-fill suggestions you review.'
                  : 'See how this template maps PDF boxes to Bite Book data sources. The mapping is owned by the template author.'}
              </p>
              <div
                style={{
                  marginTop: '0.6rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <Link
                  href={`/app/docs/${docId}/mapping`}
                  className="bb-cta-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {viewerOwnsDoc
                    ? mappingStatus === 'unmapped'
                      ? 'Set up mapping'
                      : 'Edit mapping'
                    : 'View mapping'}
                </Link>
                {showSetSignatureButton && viewerOwnsDoc && !isArchived && (
                  <Link
                    href={`/app/docs/${docId}/sign-placement`}
                    className="bb-btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    Set signature locations
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          {error}
        </p>
      )}
      {(pending || savedAt !== null) && !error && (
        <p
          className="bb-form-help"
          role="status"
          aria-live="polite"
          style={{ margin: 0, color: pending ? 'var(--color-ink-soft)' : 'var(--color-copper)' }}
        >
          {pending ? 'Saving changes…' : 'Saved.'}
        </p>
      )}
    </form>
  )
}
