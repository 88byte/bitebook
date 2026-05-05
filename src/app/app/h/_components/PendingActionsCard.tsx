// v27.1.3 — Hunter dashboard "Pending actions" tile. Server component
// since each row is just a Link to the trip detail where the hunter can
// complete the action (we don't fire completeHunterActionAction here —
// the trip detail already has the per-doc context the hunter needs).
//
// Renders as a `bb-tile` with header + an inline list. Returns null when
// there is nothing pending so the parent doesn't render an empty header.
//
// v27.1.3.0.6 — broadened to render two kinds of rows in one merged list:
//   1. trip-doc actions (sign / view) — existing HunterPendingAction
//   2. wallet-link pendings (license / tag) — new HunterPendingWalletLink
// Both kinds tap through to /app/h/trips/[id]; the trip detail's
// ActionNeededCard owns the actual link / acknowledge UI. We surface the
// list cross-trip here so the hunter sees outstanding work without
// having to open every upcoming trip individually.

import Link from 'next/link'
import { AlertCircle, ArrowRight, type LucideIcon } from 'lucide-react'
import type { HunterPendingAction } from '../../_lib/trip-doc-queries'
import type { HunterPendingWalletLink } from '../../_lib/queries'

function actionTypeLabel(actionType: string): string {
  if (actionType === 'sign') return 'Sign'
  if (actionType === 'view') return 'View'
  return actionType
}

// Discriminated union — UI is identical on the surface, but each kind
// has its own copy + required-pill rules.
type PendingItem =
  | { kind: 'doc'; data: HunterPendingAction }
  | { kind: 'wallet'; data: HunterPendingWalletLink }

export default function PendingActionsCard({
  actions,
  walletLinks,
}: {
  actions: HunterPendingAction[]
  walletLinks: HunterPendingWalletLink[]
}) {
  if (actions.length === 0 && walletLinks.length === 0) return null

  // Merge into one list. Wallet links surface first (license / tag block
  // a hunter from being legal in the field — that's the higher-stakes
  // pending item than acknowledging a doc), then trip-doc actions.
  const items: PendingItem[] = [
    ...walletLinks.map((w) => ({ kind: 'wallet' as const, data: w })),
    ...actions.map((a) => ({ kind: 'doc' as const, data: a })),
  ]

  // v27.6.3.3 item 2 — was a full-width bb-tile bb-form-section card
  // ("massive card... whole length of the page" per Flavio). Now an
  // inline section without card chrome, capped via .bb-pending-card
  // max-width (44rem at >=1280px) so it doesn't span the whole page.
  // Header is a single line with copper alert + label + helper inline;
  // rows keep the existing tappable shell.
  return (
    <section
      className="bb-pending-card"
      aria-labelledby="bb-pending-actions"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '0.5rem',
        }}
      >
        <h2
          id="bb-pending-actions"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}
        >
          <AlertCircle size={16} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Pending actions
        </h2>
        <span className="bb-form-help" style={{ margin: 0 }}>
          Open the trip to take care of each one.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) =>
          item.kind === 'wallet' ? (
            <PendingWalletRow
              key={`w-${item.data.trip_id}-${item.data.kind}`}
              item={item.data}
            />
          ) : (
            <PendingActionRow key={`a-${item.data.id}`} action={item.data} />
          )
        )}
      </div>
    </section>
  )
}

function RowShell({
  href,
  primary,
  pill,
  secondary,
}: {
  href: string
  primary: string
  pill?: { label: string; bg: string; fg: string } | null
  secondary: string
}) {
  const ArrowIcon: LucideIcon = ArrowRight
  return (
    <Link
      href={href}
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
            {primary}
          </span>
          {pill && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 999,
                background: pill.bg,
                color: pill.fg,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {pill.label}
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
          {secondary}
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

function PendingActionRow({ action }: { action: HunterPendingAction }) {
  return (
    <RowShell
      href={`/app/h/trips/${action.trip_id}`}
      primary={action.trip_title}
      pill={
        action.required
          ? { label: 'Required', bg: '#F2D6CE', fg: '#8C3C2A' }
          : null
      }
      secondary={`${actionTypeLabel(action.action_type)} · ${action.doc_label}`}
    />
  )
}

function PendingWalletRow({ item }: { item: HunterPendingWalletLink }) {
  // Plain-English copy that mirrors what the trip-detail ActionNeededCard
  // shows ("Your CA hunting license", "Your buck tag"). Wallet pendings
  // are always treated as Required — a hunter without a license / tag
  // shouldn't be in the field, period.
  const label =
    item.kind === 'license'
      ? item.trip_state
        ? `Link your ${item.trip_state} hunting license`
        : 'Link your hunting license'
      : `Link your ${item.species ?? ''} tag`.trim()
  return (
    <RowShell
      href={`/app/h/trips/${item.trip_id}`}
      primary={item.trip_title}
      pill={{ label: 'Required', bg: '#F2D6CE', fg: '#8C3C2A' }}
      secondary={label}
    />
  )
}
