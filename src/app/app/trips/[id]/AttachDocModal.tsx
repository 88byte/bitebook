'use client'

// v27.1.3 — Attach-doc picker modal launched from TripDocsCard. Lists every
// guide-owned doc + Bite Book template that's NOT log-kind, NOT archived
// (the parent already passes a pre-filtered list from
// fetchAttachableDocsForGuide). Already-attached doc IDs are passed in to
// disable the row + show an "Attached" badge so the guide can't double-add.
//
// Renders into a portal via createPortal — same backdrop / card pattern as
// ConfirmModal but with a scrollable list region. Confirm with the
// currently-selected doc id; calls attachDocToTripAction(tripId, docId, true)
// then closes + refreshes.

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { BookOpen, ClipboardCheck, FileText, Sparkles, type LucideIcon } from 'lucide-react'
import { attachDocToTripAction } from '../../_lib/trip-doc-actions'
import type { AttachableDoc } from '../../_lib/trip-doc-queries'

function docKindIcon(kind: string): LucideIcon {
  if (kind === 'waiver') return ClipboardCheck
  if (kind === 'resource') return BookOpen
  return FileText
}

function docKindLabel(kind: string): string {
  if (kind === 'waiver') return 'Waiver'
  if (kind === 'resource') return 'Resource'
  return kind
}

export default function AttachDocModal({
  open,
  tripId,
  attachable,
  attachedDocIds,
  onClose,
}: {
  open: boolean
  tripId: string
  attachable: AttachableDoc[]
  attachedDocIds: Set<string>
  onClose: () => void
}) {
  const router = useRouter()
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setSelected('')
      setError(null)
      const t = setTimeout(() => cancelRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!isPending) onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, isPending, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  function onConfirm() {
    if (!selected) {
      setError('Pick a doc first.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await attachDocToTripAction(tripId, selected, true)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return createPortal(
    <div
      className="bb-modal-backdrop"
      onClick={() => {
        if (!isPending) onClose()
      }}
      role="presentation"
    >
      <div
        ref={cardRef}
        className="bb-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '32rem' }}
      >
        <h2 id={titleId} className="bb-modal-title">Attach a doc</h2>
        <p className="bb-modal-body">
          Pick a waiver or resource from your library or a Bite Book template.
        </p>

        {attachable.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No docs available</div>
            <p className="bb-empty-sub">
              Upload a waiver or resource from your Docs library first.
            </p>
          </div>
        ) : (
          <div
            style={{
              maxHeight: '22rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              paddingRight: '0.25rem',
            }}
          >
            {attachable.map((d) => {
              const Icon = docKindIcon(d.kind)
              const alreadyAttached = attachedDocIds.has(d.id)
              const isSelected = selected === d.id
              return (
                <label
                  key={d.id}
                  className="bb-tile"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                    padding: '0.7rem 0.85rem',
                    cursor: alreadyAttached ? 'not-allowed' : 'pointer',
                    opacity: alreadyAttached ? 0.55 : 1,
                    borderColor: isSelected ? 'var(--color-copper)' : 'var(--color-ink-tint)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                >
                  <input
                    type="radio"
                    name="attach-doc"
                    value={d.id}
                    checked={isSelected}
                    onChange={() => setSelected(d.id)}
                    disabled={alreadyAttached || isPending}
                    style={{ marginTop: 4, flexShrink: 0 }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: 'var(--color-paper-tint)',
                      color: 'var(--color-ink-soft)',
                    }}
                  >
                    <Icon size={16} />
                  </span>
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--color-ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {d.label}
                      </span>
                      {d.is_template && (
                        <span
                          style={{
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 999,
                            background: 'rgba(168, 92, 50, 0.12)',
                            color: 'var(--color-copper)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Sparkles size={10} aria-hidden="true" />
                          Bite Book template
                        </span>
                      )}
                      {alreadyAttached && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 999,
                            background: 'var(--color-ink-tint)',
                            color: 'var(--color-ink-soft)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Attached
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        color: 'var(--color-ink-soft)',
                        marginTop: '0.15rem',
                      }}
                    >
                      {docKindLabel(d.kind)}
                      {d.state ? ` · ${d.state}` : ''}
                    </span>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {error && (
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.5rem' }}>
            {error}
          </p>
        )}

        <div className="bb-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bb-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || !selected || attachable.length === 0}
            className="bb-cta-sm"
          >
            {isPending ? 'Attaching…' : 'Attach'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
