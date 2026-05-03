'use client'

// v27.1.3 — Hunter-side trip docs list. Renders below Action Needed /
// harvests on /app/h/trips/[id]. Each row shows the doc icon + label +
// kind badge, an Open link to the signed PDF, an inline Download link,
// and (when an action is required AND not yet completed) a red "Required:
// sign|view" pill plus an inline action button.
//
// When my_action.completed_at is set the badge flips to a green
// "Acknowledged on {date}" / "Viewed on {date}" pill instead of the
// action button, matching the v27.0b.6 ActionNeededCard "linked"
// morph pattern.
//
// Parent gates on `docs.length > 0` and renders nothing when empty so
// hunters with no visible docs don't see a stray section header.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { completeHunterActionAction } from '../../../../_lib/trip-doc-actions'
import type { TripDocRow } from '../../../../_lib/trip-doc-queries'

export type HunterTripDoc = Omit<TripDocRow, 'actions'> & {
  my_action: TripDocRow['actions'][number] | null
}

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

function actionVerb(actionType: string): string {
  return actionType === 'sign' ? 'sign' : 'view'
}

function completedVerb(actionType: string): string {
  return actionType === 'sign' ? 'Acknowledged' : 'Viewed'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function HunterTripDocsSection({ docs }: { docs: HunterTripDoc[] }) {
  if (docs.length === 0) return null
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="td-trip-docs">
      <div className="bb-tile-body">
        <h2
          id="td-trip-docs"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <FileText size={18} aria-hidden="true" />
          Trip docs
        </h2>
        <div className="flex flex-col gap-3" style={{ marginTop: '0.6rem' }}>
          {docs.map((d) => (
            <HunterDocRow key={d.id} row={d} />
          ))}
        </div>
      </div>
    </section>
  )
}

function HunterDocRow({ row }: { row: HunterTripDoc }) {
  const Icon = docKindIcon(row.doc.kind)
  const action = row.my_action
  const requiredOpen = !!action && action.required && !action.completed_at
  const completed = !!action?.completed_at

  return (
    <div
      className="bb-tile"
      style={{
        padding: '0.75rem 0.85rem',
        borderColor: requiredOpen ? '#B33A2E' : 'var(--color-ink-tint)',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background: 'var(--color-paper-tint)',
            color: 'var(--color-ink-soft)',
          }}
        >
          <Icon size={18} />
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
              {row.doc.label}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '0.15rem 0.45rem',
                borderRadius: 999,
                background: 'var(--color-paper-tint)',
                color: 'var(--color-ink-soft)',
                whiteSpace: 'nowrap',
              }}
            >
              {docKindLabel(row.doc.kind)}
            </span>
            {requiredOpen && action && (
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
                Required: {actionVerb(action.action_type)}
              </span>
            )}
            {completed && action?.completed_at && (
              <span
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: 999,
                  background: '#DDE7DD',
                  color: '#2F5233',
                  whiteSpace: 'nowrap',
                }}
              >
                <Check size={10} aria-hidden="true" />
                {completedVerb(action.action_type)} on {fmtDate(action.completed_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.55rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        {row.signed_url && (
          <>
            <a
              href={row.signed_url}
              target="_blank"
              rel="noreferrer noopener"
              className="bb-text-action bb-text-action-copper"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.78rem',
              }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Open
            </a>
            <a
              href={row.signed_url}
              download
              className="bb-text-action bb-text-action-copper"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.78rem',
              }}
            >
              <Download size={14} aria-hidden="true" />
              Download
            </a>
          </>
        )}
        {requiredOpen && action && (
          <CompleteActionButton actionId={action.id} actionType={action.action_type} />
        )}
      </div>
    </div>
  )
}

function CompleteActionButton({
  actionId,
  actionType,
}: {
  actionId: string
  actionType: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const label = actionType === 'sign' ? 'Acknowledge' : 'Mark as viewed'

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await completeHunterActionAction(actionId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="bb-cta-sm"
      >
        {isPending ? 'Saving…' : label}
      </button>
      {error && (
        <span style={{ color: '#8C3C2A', fontSize: '0.78rem' }} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
