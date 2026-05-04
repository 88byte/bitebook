'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  BookOpen,
  ClipboardCheck,
  FileText,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { bulkArchiveDocsAction, bulkDeleteDocsAction, bulkRestoreDocsAction } from '../_lib/docs-actions'
import type { DocSummary } from '../_lib/docs-queries'
import { relativeOrDate } from '../_lib/format'

// v27.1.1.0.3e.4 — bulk select + delete on /app/docs library.
//
// Wraps the "Your library" section. Each row has a checkbox; selecting any
// reveals a sticky action bar with N selected · Archive · Delete · Cancel.
// Templates section is rendered separately (server-side) and not selectable
// since templates are admin-curated and not the guide's to delete.
//
// Selection state is local to this component; nothing persists across
// navigation. After a successful bulk action we clear selection and call
// router.refresh() so the new list re-renders without the deleted/archived
// rows.

export default function DocsLibraryList({ docs }: { docs: DocSummary[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null)

  const visibleIds = useMemo(() => docs.map((d) => d.id), [docs])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  // v27.1.1.0.3e.8: derive whether the current selection is all-archived,
  // all-active, or mixed. The bulk action bar swaps Archive ↔ Restore
  // accordingly. Mixed selection defaults to Archive (no-op on already-
  // archived rows) — pragmatic over a third "Mixed" state.
  const archivedById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const d of docs) m.set(d.id, !!d.archived_at)
    return m
  }, [docs])
  const selectedArchivedFlags = useMemo(() => {
    const flags: boolean[] = []
    for (const id of selected) {
      const v = archivedById.get(id)
      if (v !== undefined) flags.push(v)
    }
    return flags
  }, [selected, archivedById])
  const allSelectedArchived = selectedArchivedFlags.length > 0 && selectedArchivedFlags.every(Boolean)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visibleIds))
    }
  }

  function clear() {
    setSelected(new Set())
    setError(null)
    setSkippedNotice(null)
  }

  function describeSkipped(skipped: { id: string; reason: string }[]): string {
    if (skipped.length === 0) return ''
    // Group reasons so the toast doesn't list 10 ids individually.
    const reasons = new Map<string, number>()
    for (const s of skipped) {
      reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1)
    }
    return Array.from(reasons.entries())
      .map(([reason, count]) => `${count} skipped — ${reason}`)
      .join(' · ')
  }

  function runArchive() {
    setError(null)
    setSkippedNotice(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      const res = await bulkArchiveDocsAction(ids)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.skipped.length > 0) setSkippedNotice(describeSkipped(res.skipped))
      setSelected(new Set())
      router.refresh()
    })
  }

  // v27.1.1.0.3e.8: bulk restore — symmetric to archive. Only fires when
  // every selected row is currently archived (the action bar's Restore
  // button gates on allSelectedArchived).
  function runRestore() {
    setError(null)
    setSkippedNotice(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      const res = await bulkRestoreDocsAction(ids)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.skipped.length > 0) setSkippedNotice(describeSkipped(res.skipped))
      setSelected(new Set())
      router.refresh()
    })
  }

  function runDelete() {
    setError(null)
    setSkippedNotice(null)
    const ids = Array.from(selected)
    startTransition(async () => {
      const res = await bulkDeleteDocsAction(ids)
      if ('error' in res) {
        setError(res.error)
        return
      }
      if (res.skipped.length > 0) setSkippedNotice(describeSkipped(res.skipped))
      setSelected(new Set())
      router.refresh()
    })
  }

  if (docs.length === 0) return null

  return (
    <div>
      {/* Sticky bulk-action bar — appears once any row is selected. */}
      {selected.size > 0 && (
        <div
          className="bb-bulk-bar"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="bb-bulk-bar-inner">
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                color: 'var(--color-ink)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label={allSelected ? 'Deselect all' : 'Select all'}
              />
              {selected.size} selected
            </label>
            <div style={{ display: 'inline-flex', gap: '0.4rem', flexShrink: 0 }}>
              {/* v27.1.1.0.3e.8: archive ↔ restore swap. When every
                  selected row is archived, the button morphs to
                  Restore (calls bulkRestoreDocsAction). Otherwise it's
                  Archive (bulkArchiveDocsAction; the action's IS NULL
                  filter no-ops the already-archived rows in a mixed
                  selection). */}
              {allSelectedArchived ? (
                <button
                  type="button"
                  className="bb-cta-sm"
                  onClick={runRestore}
                  disabled={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <ArchiveRestore size={14} aria-hidden="true" />
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="bb-cta-sm"
                  onClick={runArchive}
                  disabled={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Archive size={14} aria-hidden="true" />
                  Archive
                </button>
              )}
              <button
                type="button"
                className="bb-cta-sm bb-cta-sm-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
              <button
                type="button"
                className="bb-text-action"
                onClick={clear}
                disabled={pending}
                aria-label="Cancel selection"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <X size={14} aria-hidden="true" />
                Cancel
              </button>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              style={{ color: '#8C3C2A', fontSize: '0.85rem', marginTop: '0.4rem' }}
            >
              {error}
            </p>
          )}
          {skippedNotice && (
            <p
              role="status"
              style={{ color: 'var(--color-ink-soft)', fontSize: '0.8rem', marginTop: '0.3rem' }}
            >
              {skippedNotice}
            </p>
          )}
        </div>
      )}

      <div className="bb-docs-list mt-3 flex flex-col gap-3">
        {docs.map((d) => (
          <SelectableDocRow
            key={d.id}
            doc={d}
            selected={selected.has(d.id)}
            onToggle={() => toggle(d.id)}
          />
        ))}
      </div>

      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${selected.size} doc${selected.size === 1 ? '' : 's'}?`}
        body="The selected docs will be permanently removed. Active docs get archived first as part of the same step. Trip attachments are cleaned up automatically. This can't be undone."
        confirmLabel="Delete"
        destructive
        isPending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          runDelete()
        }}
      />
    </div>
  )
}

// Row matches the server-rendered DocRow on /app/docs/page.tsx but adds a
// leading checkbox and routes the click target so checking the box doesn't
// also navigate.
function SelectableDocRow({
  doc,
  selected,
  onToggle,
}: {
  doc: DocSummary
  selected: boolean
  onToggle: () => void
}) {
  const Icon = doc.kind === 'waiver' ? ClipboardCheck : doc.kind === 'log' ? FileText : BookOpen
  const kindLabel =
    doc.kind === 'waiver' ? 'Waiver' : doc.kind === 'log' ? 'Harvest log' : 'Resource'
  const isArchived = !!doc.archived_at

  return (
    <div
      className="bb-tile"
      style={{
        opacity: isArchived ? 0.6 : 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.875rem 1rem',
      }}
    >
      <label
        // Wrap the checkbox in a label-with-stop so a mis-touch on the
        // checkbox column doesn't trigger the row link.
        onClick={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 36,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${doc.label}`}
        />
      </label>

      <Link
        href={`/app/docs/${doc.id}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          flex: '1 1 0',
          minWidth: 0,
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
            backgroundColor: 'var(--color-paper-tint)',
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
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {doc.label}
            </span>
            {doc.is_template && <TemplateBadge />}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.1rem',
              marginTop: '0.15rem',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)', overflowWrap: 'anywhere' }}>
              {kindLabel}
              {doc.state ? ` · ${doc.state}` : ''}
              {' · '}Updated {relativeOrDate(doc.updated_at)}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)', overflowWrap: 'anywhere' }}>
              {doc.trip_count > 0
                ? `On ${doc.trip_count} trip${doc.trip_count === 1 ? '' : 's'}`
                : 'Not attached to a trip'}
            </span>
          </div>
        </div>
        <MappingBadge status={doc.mapping_status} archived={isArchived} />
      </Link>
    </div>
  )
}

function TemplateBadge() {
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

function MappingBadge({ status, archived }: { status: string; archived: boolean }) {
  if (archived) {
    return (
      <span
        style={{
          flexShrink: 0,
          fontSize: '0.75rem',
          fontWeight: 600,
          padding: '0.2rem 0.5rem',
          borderRadius: 999,
          background: 'var(--color-ink-tint)',
          color: 'var(--color-ink-soft)',
        }}
      >
        Archived
      </span>
    )
  }
  if (status === 'not_applicable') return null
  if (status === 'complete') {
    return (
      <span
        style={{
          flexShrink: 0,
          fontSize: '0.75rem',
          fontWeight: 600,
          padding: '0.2rem 0.5rem',
          borderRadius: 999,
          background: 'rgba(168, 92, 50, 0.12)',
          color: 'var(--color-copper)',
        }}
      >
        Mapped
      </span>
    )
  }
  return (
    <span
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '0.2rem 0.5rem',
        borderRadius: 999,
        background: 'rgba(168, 92, 50, 0.12)',
        color: 'var(--color-copper)',
      }}
    >
      <AlertCircle size={11} aria-hidden="true" />
      {status === 'partial' ? 'Partial' : 'Needs mapping'}
    </span>
  )
}
