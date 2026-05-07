'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, Trash2, X } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { bulkDeleteTripsAction } from './[id]/actions'

// v27.9.4 — bulk-select wrapper around the existing trip list. The
// page renders TripRow children in document order; this client
// component layers two pieces of UX on top:
//
//   1. A "Select" toggle button (above the list) that flips into
//      selection mode. In select mode each child gets a left-edge
//      checkbox overlay, and tap-to-select dims the row.
//   2. A sticky bulk-action bar that appears when 1+ trips are
//      checked. Shows the count + Delete + Cancel.
//
// Surgical: the trip list itself (TripRow) is rendered unchanged
// by the parent server page; this wrapper just receives `children`
// + matching `tripIds` (in the same order) and renders the
// checkbox overlay + bar. No CSS file edits — inline styles keep
// the change scoped.
export default function BulkSelectableTripsList({
  tripIds,
  children,
}: {
  tripIds: string[]
  // Each child corresponds to a trip in tripIds at the same index.
  children: ReactNode[]
}) {
  const router = useRouter()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [okFlash, setOkFlash] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelected(new Set())
    setError(null)
  }

  function runDelete() {
    setError(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      const r = await bulkDeleteTripsAction(ids, 'delete')
      if ('error' in r) {
        setError(r.error)
        return
      }
      const total = ids.length
      const ok = r.deletedCount
      const failed = r.failedIds.length
      setConfirmOpen(false)
      exitSelectionMode()
      setOkFlash(
        failed === 0
          ? `Deleted ${ok} ${ok === 1 ? 'trip' : 'trips'}.`
          : `Deleted ${ok} of ${total}. ${failed} failed.`,
      )
      setTimeout(() => setOkFlash(null), 3500)
      // Refresh the page so the rows re-fetch from the server.
      router.refresh()
    })
  }

  // Cards is the child array in render order; we re-emit each child
  // wrapped in a tap-to-select shell when selection mode is on.
  const isOn = selectionMode

  return (
    <div style={{ position: 'relative' }}>
      {/* Above-list toolbar: flip into / out of selection mode +
          flash success copy after a successful bulk delete. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        {okFlash && (
          <span
            role="status"
            className="bb-form-help"
            style={{
              margin: 0,
              padding: '0.3rem 0.6rem',
              borderRadius: 6,
              background: 'rgba(176, 108, 60, 0.12)',
              color: 'var(--color-copper)',
              fontWeight: 600,
            }}
          >
            {okFlash}
          </span>
        )}
        {!isOn ? (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setSelectionMode(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <CheckSquare size={14} aria-hidden="true" />
            Select
          </button>
        ) : (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={exitSelectionMode}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <X size={14} aria-hidden="true" />
            Done
          </button>
        )}
      </div>

      {/* Sticky bulk action bar — visible only when at least one
          trip is checked. Sits above the list and pins to the top
          of the scroll container when scrolling past it. */}
      {isOn && selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: '0.5rem',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.6rem 0.85rem',
            marginBottom: '0.6rem',
            borderRadius: 10,
            background: 'var(--color-page-bg, #0B0806)',
            color: '#F4EFE5',
            boxShadow: '0 6px 20px -8px rgba(0, 0, 0, 0.45)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-barlow-condensed)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.85rem',
            }}
          >
            {selected.size} {selected.size === 1 ? 'trip' : 'trips'} selected
          </span>
          <div style={{ display: 'inline-flex', gap: '0.4rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setConfirmOpen(true)
              }}
              disabled={pending}
              className="bb-cta-sm bb-cta-sm-destructive"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
            <button
              type="button"
              onClick={exitSelectionMode}
              disabled={pending}
              className="bb-btn-secondary"
              style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.35)', color: '#F4EFE5' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          {error}
        </p>
      )}

      {/* List — wrap each child with checkbox overlay when in
          selection mode. Outside selection mode the children render
          identically to the pre-v27.9.4 behavior.
          v27.9.4.1 — was a wrapper div + hidden <input checkbox> +
          visible icon span. Two bugs:
          (1) clicking the input area fired BOTH the input's onChange
              and the wrapper's onClick → toggle(id) ran twice → state
              flipped and flipped back, visible as a no-op.
          (2) the wrapper's "ignore clicks inside a, button" guard let
              the inner TripRow's <Link> navigate away before the
              wrapper could intercept on row-body taps.
          Fix: render a single absolute-positioned <button> overlay
          covering the whole row when in selection mode. Higher
          z-index than the Link inside TripRow, so it captures every
          click cleanly. One handler, no double-fire, no navigation. */}
      <div role="list" className="flex flex-col gap-3">
        {children.map((child, idx) => {
          const id = tripIds[idx]
          const checked = selected.has(id)
          if (!isOn) {
            return (
              <div role="listitem" key={id}>
                {child}
              </div>
            )
          }
          return (
            <div
              role="listitem"
              key={id}
              style={{
                position: 'relative',
                borderRadius: 12,
                outline: checked ? '2px solid var(--color-copper)' : '2px solid transparent',
                outlineOffset: 2,
                transition: 'outline-color 120ms ease',
              }}
            >
              {/* Single overlay button — captures all clicks within
                  the row's bounds. Sits above the TripRow's internal
                  Link, so a tap anywhere selects without navigating. */}
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={checked}
                aria-label={checked ? 'Deselect trip' : 'Select trip'}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 4,
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  borderRadius: 12,
                }}
              />
              {/* Visible check indicator top-left. pointer-events:none
                  so it never intercepts the overlay button's clicks. */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 5,
                  background: '#FFFFFF',
                  borderRadius: 6,
                  padding: 2,
                  display: 'inline-flex',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  pointerEvents: 'none',
                }}
              >
                {checked ? (
                  <CheckSquare size={20} style={{ color: 'var(--color-copper)' }} />
                ) : (
                  <Square size={20} style={{ color: 'var(--color-ink-muted)' }} />
                )}
              </span>
              {child}
            </div>
          )
        })}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={`Delete ${selected.size} ${selected.size === 1 ? 'trip' : 'trips'} permanently?`}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p>
              This deletes every selected trip plus all harvest logs and
              entries, trip participants, linked wallet items, attached
              docs, generated report PDFs, and any invitations.{' '}
              <strong>This cannot be undone.</strong>
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
        typeToConfirm="delete"
        onConfirm={runDelete}
        onCancel={() => {
          if (!pending) setConfirmOpen(false)
        }}
        isPending={pending}
      />
    </div>
  )
}
