'use client'

// v27.1.3 — Trip-doc attachment + per-hunter actions, guide side.
// Renders BELOW TripDetailEditor on /app/trips/[id]. Each attached doc
// shows: kind icon + label + kind badge, hunter-visible toggle, Manage
// actions, Detach (Trash2). Empty state offers an Attach doc CTA.
//
// State strategy: server already revalidates the trip path on every
// mutation, so this component only needs router.refresh() after a server
// action returns ok. The local optimistic state is a single `pendingId`
// guard so two clicks on the same row can't double-fire while in-flight.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  ClipboardCheck,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  detachDocFromTripAction,
  setTripDocVisibilityAction,
} from '../../_lib/trip-doc-actions'
import type { TripDocRow, AttachableDoc } from '../../_lib/trip-doc-queries'
import AttachDocModal from './AttachDocModal'
import ManageDocActionsModal from './ManageDocActionsModal'

export type TripDocsParticipant = {
  id: string
  display_name: string
}

export default function TripDocsCard({
  tripId,
  tripDocs,
  attachable,
  participants,
}: {
  tripId: string
  tripDocs: TripDocRow[]
  attachable: AttachableDoc[]
  participants: TripDocsParticipant[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorByRow, setErrorByRow] = useState<Record<string, string | null>>({})
  const [attachOpen, setAttachOpen] = useState(false)
  const [confirmDetach, setConfirmDetach] = useState<TripDocRow | null>(null)
  const [manageRow, setManageRow] = useState<TripDocRow | null>(null)

  function clearRowErr(id: string) {
    setErrorByRow((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function handleVisibility(row: TripDocRow, nextVisible: boolean) {
    clearRowErr(row.id)
    setPendingId(row.id)
    startTransition(async () => {
      const res = await setTripDocVisibilityAction(row.id, nextVisible)
      setPendingId(null)
      if ('error' in res) {
        setErrorByRow((prev) => ({ ...prev, [row.id]: res.error }))
        return
      }
      router.refresh()
    })
  }

  function handleDetachConfirm() {
    const row = confirmDetach
    if (!row) return
    clearRowErr(row.id)
    setPendingId(row.id)
    startTransition(async () => {
      const res = await detachDocFromTripAction(row.id)
      setPendingId(null)
      setConfirmDetach(null)
      if ('error' in res) {
        setErrorByRow((prev) => ({ ...prev, [row.id]: res.error }))
        return
      }
      router.refresh()
    })
  }

  return (
    <section
      className="bb-tile bb-form-section"
      aria-labelledby="bb-trip-docs"
      style={{ marginTop: '1rem' }}
    >
      <div className="bb-tile-body">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <h2 id="bb-trip-docs" className="bb-form-section-head" style={{ margin: 0 }}>
            Docs
          </h2>
          {tripDocs.length > 0 && (
            <button
              type="button"
              className="bb-cta-sm"
              onClick={() => setAttachOpen(true)}
              disabled={pending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={14} aria-hidden="true" />
              Attach doc
            </button>
          )}
        </div>

        {tripDocs.length === 0 ? (
          <div className="bb-empty" style={{ marginTop: '0.6rem' }}>
            <div className="bb-empty-title">No docs attached</div>
            <p className="bb-empty-sub">
              Attach waivers, resources, or checklists for this trip.
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="bb-cta-sm"
                onClick={() => setAttachOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Plus size={14} aria-hidden="true" />
                Attach doc
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3" style={{ marginTop: '0.75rem' }}>
            {tripDocs.map((row) => (
              <DocAttachmentRow
                key={row.id}
                row={row}
                pending={pendingId === row.id || pending}
                error={errorByRow[row.id] ?? null}
                onToggleVisibility={(v) => handleVisibility(row, v)}
                onManageActions={() => setManageRow(row)}
                onDetach={() => setConfirmDetach(row)}
              />
            ))}
          </div>
        )}
      </div>

      <AttachDocModal
        open={attachOpen}
        tripId={tripId}
        attachable={attachable}
        attachedDocIds={new Set(tripDocs.map((r) => r.doc_id))}
        onClose={() => setAttachOpen(false)}
      />

      <ManageDocActionsModal
        open={!!manageRow}
        row={manageRow}
        participants={participants}
        onClose={() => setManageRow(null)}
      />

      <ConfirmModal
        open={!!confirmDetach}
        title="Remove this doc from the trip?"
        body={
          confirmDetach
            ? `Remove "${confirmDetach.doc.label}" from this trip? Hunters won't see it any more. The doc itself stays in your library.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Keep attached"
        destructive
        isPending={pending && !!confirmDetach && pendingId === confirmDetach.id}
        onConfirm={handleDetachConfirm}
        onCancel={() => setConfirmDetach(null)}
      />
    </section>
  )
}

function docKindIcon(kind: string): LucideIcon {
  if (kind === 'waiver') return ClipboardCheck
  if (kind === 'resource') return BookOpen
  return FileText
}

function docKindLabel(kind: string): string {
  if (kind === 'waiver') return 'Waiver'
  if (kind === 'resource') return 'Resource'
  if (kind === 'log') return 'Harvest log'
  return kind
}

function DocAttachmentRow({
  row,
  pending,
  error,
  onToggleVisibility,
  onManageActions,
  onDetach,
}: {
  row: TripDocRow
  pending: boolean
  error: string | null
  onToggleVisibility: (next: boolean) => void
  onManageActions: () => void
  onDetach: () => void
}) {
  const Icon = docKindIcon(row.doc.kind)
  return (
    <div
      className="bb-tile"
      style={{
        padding: '0.75rem 0.85rem',
        borderColor: 'var(--color-ink-tint)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.65rem',
        }}
      >
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
            <KindBadge kind={row.doc.kind} isTemplate={row.doc.is_template} />
          </div>
          {row.signed_url && (
            <div style={{ marginTop: '0.3rem' }}>
              <a
                href={row.signed_url}
                target="_blank"
                rel="noreferrer noopener"
                className="bb-text-action bb-text-action-copper"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <ExternalLink size={12} aria-hidden="true" />
                Open
              </a>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => onToggleVisibility(!row.hunter_visible)}
          disabled={pending}
          className="bb-text-action bb-text-action-copper"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.78rem',
          }}
          aria-pressed={row.hunter_visible}
          title={row.hunter_visible ? 'Hide from hunters' : 'Show to hunters'}
        >
          {row.hunter_visible ? (
            <>
              <Eye size={14} aria-hidden="true" />
              Visible
            </>
          ) : (
            <>
              <EyeOff size={14} aria-hidden="true" />
              Hidden
            </>
          )}
        </button>

        <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {(row.doc.kind === 'waiver' || row.doc.kind === 'resource') && (
            <button
              type="button"
              onClick={onManageActions}
              disabled={pending}
              className="bb-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <SettingsIcon size={14} aria-hidden="true" />
              Manage actions
            </button>
          )}
          <button
            type="button"
            onClick={onDetach}
            disabled={pending}
            className="bb-text-action bb-text-action-copper"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.78rem',
            }}
            aria-label={`Detach ${row.doc.label}`}
            title="Detach"
          >
            <Trash2 size={14} aria-hidden="true" />
            Detach
          </button>
        </div>
      </div>

      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function KindBadge({ kind, isTemplate }: { kind: string; isTemplate: boolean }) {
  if (isTemplate) {
    return (
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
    )
  }
  return (
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
      {docKindLabel(kind)}
    </span>
  )
}
