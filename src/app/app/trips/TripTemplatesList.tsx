'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  archiveTripTemplateAction,
  deleteTripTemplateAction,
  unarchiveTripTemplateAction,
} from '../_lib/trip-template-actions'
import type { TripTemplateSummary } from '../_lib/trip-template-queries'

// v27.1.4 — Templates tab body. Mirrors DocsLibraryList structure but
// without bulk select; per-row Archive / Restore / Delete instead. Each
// row links to /app/trips/templates/[id] (a future detail page) and shows
// a quick "Use template" CTA that takes the guide to /app/trips/new with
// the template id in the query string.
//
// Each row resolves its own archived state from template.archived_at, so
// the action set on each row stays correct regardless of the page filter.
export default function TripTemplatesList({
  templates,
}: {
  templates: TripTemplateSummary[]
}) {
  return (
    <div className="flex flex-col gap-3">
      {templates.map((t) => (
        <TripTemplateRow key={t.id} template={t} />
      ))}
    </div>
  )
}

function TripTemplateRow({ template }: { template: TripTemplateSummary }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isArchived = !!template.archived_at
  const activityLabel =
    template.activity === 'fishing'
      ? 'Fishing'
      : template.activity === 'hunting'
        ? 'Hunting'
        : 'Activity not set'
  const stateLabel = template.state ? template.state : null
  const subParts: string[] = [activityLabel]
  if (stateLabel) subParts.push(stateLabel)
  if (template.city) subParts.push(template.city)
  const docsLine = `${template.doc_count} ${template.doc_count === 1 ? 'doc' : 'docs'}`

  function runArchive() {
    setError(null)
    startTransition(async () => {
      const res = await archiveTripTemplateAction(template.id)
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
      const res = await unarchiveTripTemplateAction(template.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function runDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteTripTemplateAction(template.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      className="bb-tile"
      style={{
        opacity: isArchived ? 0.6 : 1,
        padding: '0.875rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <Link
        href={`/app/trips/templates/${template.id}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
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
          <Bookmark size={18} />
        </span>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: 'var(--color-ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {template.label}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.1rem',
              marginTop: '0.15rem',
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-ink-soft)',
                overflowWrap: 'anywhere',
              }}
            >
              {subParts.join(' · ')}
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-ink-soft)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <FileText size={12} aria-hidden="true" />
              {docsLine}
            </span>
          </div>
        </div>
        {isArchived && (
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
        )}
      </Link>

      {/* Per-row actions. Use template only on active rows; restore/delete
          on archived rows; archive/delete on active rows. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          alignItems: 'center',
        }}
      >
        {!isArchived && (
          <Link
            href={`/app/trips/new?template=${template.id}`}
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Use template
          </Link>
        )}
        {isArchived ? (
          <button
            type="button"
            className="bb-btn-secondary"
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
            className="bb-btn-secondary"
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
      </div>

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${template.label}?`}
        body="This template will be permanently removed. Trips you already created from it stay untouched. This can't be undone."
        confirmLabel="Delete template"
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
