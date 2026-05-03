// v27.1.3 — Hunter dashboard "Pending actions" tile. Server component
// since each row is just a Link to the trip detail where the hunter can
// complete the action (we don't fire completeHunterActionAction here —
// the trip detail already has the per-doc context the hunter needs).
//
// Renders as a `bb-tile` with header + an inline list. Returns null when
// the actions array is empty so the parent doesn't render an empty header.

import Link from 'next/link'
import { AlertCircle, ArrowRight, type LucideIcon } from 'lucide-react'
import type { HunterPendingAction } from '../../_lib/trip-doc-queries'

function actionTypeLabel(actionType: string): string {
  if (actionType === 'sign') return 'Sign'
  if (actionType === 'view') return 'View'
  return actionType
}

export default function PendingActionsCard({
  actions,
}: {
  actions: HunterPendingAction[]
}) {
  if (actions.length === 0) return null
  return (
    <section
      className="bb-tile bb-form-section"
      aria-labelledby="bb-pending-actions"
      style={{
        borderColor: 'var(--color-copper)',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      <div className="bb-tile-body">
        <h2
          id="bb-pending-actions"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <AlertCircle size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Pending actions
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
          Open the trip to acknowledge each one.
        </p>
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <PendingActionRow key={a.id} action={a} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PendingActionRow({ action }: { action: HunterPendingAction }) {
  const ArrowIcon: LucideIcon = ArrowRight
  return (
    <Link
      href={`/app/h/trips/${action.trip_id}`}
      className="bb-tile"
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.65rem 0.85rem',
        borderColor: 'var(--color-ink-tint)',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
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
            {action.trip_title}
          </span>
          {action.required && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 999,
                background: '#F2D6CE',
                color: '#8C3C2A',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Required
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-ink-soft)',
            marginTop: '0.15rem',
          }}
        >
          {actionTypeLabel(action.action_type)} · {action.doc_label}
        </div>
      </div>
      <span
        className="bb-text-action bb-text-action-copper"
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '0.78rem',
        }}
        aria-hidden="true"
      >
        Open
        <ArrowIcon size={14} />
      </span>
    </Link>
  )
}
