'use client'

// v27.1.3 — Per-hunter action manager modal launched from a TripDocsCard
// row. Lists every trip participant with a checkbox; the verb depends on
// the doc kind:
//   - waiver  → "Required to sign"
//   - resource → "Required to view"
// Anything else (template-of-template, stray kind) — no rows render and
// the modal explains why.
//
// Save diffs the on-open snapshot vs the current selection and fires
// assignHunterActionAction or unassignHunterActionAction per row that
// changed. We don't try to optimistically render mid-save — the parent
// page revalidates the trip path on each mutation, so router.refresh()
// after the batch settles brings the row's `actions` array up to date.

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  assignHunterActionAction,
  unassignHunterActionAction,
} from '../../_lib/trip-doc-actions'
import type { TripDocRow } from '../../_lib/trip-doc-queries'
import type { TripDocsParticipant } from './TripDocsCard'

type ActionType = 'sign' | 'view'

function actionTypeForKind(kind: string): ActionType | null {
  if (kind === 'waiver') return 'sign'
  if (kind === 'resource') return 'view'
  return null
}

function actionVerb(actionType: ActionType): string {
  return actionType === 'sign' ? 'Required to sign' : 'Required to view'
}

export default function ManageDocActionsModal({
  open,
  row,
  participants,
  onClose,
}: {
  open: boolean
  row: TripDocRow | null
  participants: TripDocsParticipant[]
  onClose: () => void
}) {
  const router = useRouter()
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // On-open snapshot: which hunter ids currently have a required action.
  // Computed from row.actions whenever the row changes (or modal opens).
  const initial = useMemo(() => {
    if (!row) return new Set<string>()
    return new Set(row.actions.filter((a) => a.required).map((a) => a.hunter_id))
  }, [row])

  const [selected, setSelected] = useState<Set<string>>(initial)

  useEffect(() => {
    if (open) {
      setSelected(new Set(initial))
      setError(null)
      const t = setTimeout(() => cancelRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open, initial])

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

  if (!open || !row) return null
  if (typeof document === 'undefined') return null

  const actionType = actionTypeForKind(row.doc.kind)
  const supported = actionType !== null

  // Map hunter_id -> existing action row so we can call unassign by id.
  const existingByHunter = new Map(row.actions.map((a) => [a.hunter_id, a]))

  function toggleHunter(hunterId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(hunterId)) next.delete(hunterId)
      else next.add(hunterId)
      return next
    })
  }

  function onSave() {
    if (!row || !actionType) return
    setError(null)
    const before = initial
    const after = selected
    const toAdd: string[] = []
    const toRemove: string[] = []
    for (const hid of after) {
      if (!before.has(hid)) toAdd.push(hid)
    }
    for (const hid of before) {
      if (!after.has(hid)) toRemove.push(hid)
    }
    if (toAdd.length === 0 && toRemove.length === 0) {
      onClose()
      return
    }
    startTransition(async () => {
      for (const hid of toAdd) {
        const res = await assignHunterActionAction(row.id, hid, actionType, true)
        if ('error' in res) {
          setError(res.error)
          return
        }
      }
      for (const hid of toRemove) {
        const existing = existingByHunter.get(hid)
        if (!existing) continue
        const res = await unassignHunterActionAction(existing.id)
        if ('error' in res) {
          setError(res.error)
          return
        }
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
        style={{ maxWidth: '30rem' }}
      >
        <h2 id={titleId} className="bb-modal-title">Manage actions</h2>
        <p className="bb-modal-body" style={{ marginBottom: '0.5rem' }}>
          {row.doc.label}
        </p>

        {!supported ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No actions for this doc</div>
            <p className="bb-empty-sub">
              Per-hunter actions are only available on waivers (sign) and resources (view).
            </p>
          </div>
        ) : participants.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No hunters on this trip</div>
            <p className="bb-empty-sub">
              Add hunters to the trip first, then come back to assign actions.
            </p>
          </div>
        ) : (
          <div
            style={{
              maxHeight: '20rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              paddingRight: '0.25rem',
            }}
          >
            {participants.map((p) => {
              const existing = existingByHunter.get(p.id)
              const completed = !!existing?.completed_at
              const checked = selected.has(p.id)
              return (
                <label
                  key={p.id}
                  className="bb-tile"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.85rem',
                    cursor: completed ? 'not-allowed' : 'pointer',
                    borderColor: 'var(--color-ink-tint)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleHunter(p.id)}
                    disabled={isPending || completed}
                    aria-label={`${actionVerb(actionType)} — ${p.display_name}`}
                  />
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--color-ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.display_name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-soft)' }}>
                      {actionVerb(actionType)}
                      {completed && ' · already completed'}
                    </div>
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
            onClick={onSave}
            disabled={isPending || !supported}
            className="bb-cta-sm"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
