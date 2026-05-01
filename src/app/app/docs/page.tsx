import Link from 'next/link'
import { FileText, ClipboardCheck, BookOpen, Plus, AlertCircle, Archive } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { fetchGuideDocs, fetchGuideDocCounts, type DocKind, type DocSummary } from '../_lib/docs-queries'
import { relativeOrDate } from '../_lib/format'

type SearchParams = Promise<{ kind?: string; archived?: string }>

const KIND_FILTERS: { value: DocKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'waiver', label: 'Waivers' },
  { value: 'log', label: 'Logs' },
  { value: 'resource', label: 'Resources' },
]

function isKindFilter(s: string | undefined): s is DocKind | 'all' {
  return s === 'all' || s === 'waiver' || s === 'log' || s === 'resource'
}

// v27.1.0 — Documents Module library page.
// Guide uploads PDFs of three kinds (waiver / log / resource), filters by
// kind chip, sees mapping status badges, and opens the doc detail to edit
// label / state / kind. Mapping wizards land in v27.1.1+.
export default async function DocsPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const sp = await searchParams
  const kind: DocKind | 'all' = isKindFilter(sp.kind) ? sp.kind : 'all'
  const includeArchived = sp.archived === '1'

  const [docs, counts] = await Promise.all([
    fetchGuideDocs(profile.id, { kind, includeArchived }),
    fetchGuideDocCounts(profile.id),
  ])

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">Documents</p>
          <h1 className="bb-page-title">Your library</h1>
          <p className="bb-page-sub">
            Waivers, harvest logs, and resources you can attach to any trip.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            href="/app/docs/new"
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Upload doc
          </Link>
        </div>
      </header>

      {/* Filter chips. URL-driven so the browser back button works and links
          can be shared. Active state = copper underline matching the
          mobile-tab pattern. */}
      <nav
        className="mt-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Filter docs by kind"
      >
        {KIND_FILTERS.map((f) => {
          const active = f.value === kind
          const href = f.value === 'all' ? '/app/docs' : `/app/docs?kind=${f.value}`
          const count = counts[f.value]
          return (
            <Link
              key={f.value}
              href={href}
              role="tab"
              aria-selected={active}
              className={active ? 'bb-chip is-active' : 'bb-chip'}
            >
              {f.label} <span style={{ opacity: 0.65 }}>({count})</span>
            </Link>
          )
        })}
        <Link
          href={includeArchived ? '/app/docs' : '/app/docs?archived=1'}
          className={includeArchived ? 'bb-chip is-active' : 'bb-chip'}
          aria-pressed={includeArchived}
          style={{ marginLeft: 'auto' }}
        >
          <Archive size={12} aria-hidden="true" style={{ marginRight: 4 }} />
          {includeArchived ? 'Hide archived' : 'Show archived'}
        </Link>
      </nav>

      {docs.length === 0 ? (
        <EmptyState kind={kind} includeArchived={includeArchived} />
      ) : (
        <section className="mt-4 flex flex-col gap-3">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </section>
      )}
    </main>
  )
}

function EmptyState({
  kind,
  includeArchived,
}: {
  kind: DocKind | 'all'
  includeArchived: boolean
}) {
  if (includeArchived) {
    return (
      <section className="bb-tile mt-4">
        <div className="bb-tile-body" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
          <Archive size={32} aria-hidden="true" style={{ color: 'var(--color-ink-soft)', margin: '0 auto' }} />
          <div className="bb-empty-title mt-2">No archived docs</div>
          <p className="bb-empty-sub">Archived docs appear here. Restore or hard-delete from a doc&rsquo;s detail page.</p>
        </div>
      </section>
    )
  }
  const kindLabel =
    kind === 'all'
      ? 'docs'
      : kind === 'waiver'
        ? 'waivers'
        : kind === 'log'
          ? 'logs'
          : 'resources'
  return (
    <section className="bb-tile mt-4">
      <div className="bb-tile-body" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <FileText size={36} aria-hidden="true" style={{ color: 'var(--color-ink-soft)', margin: '0 auto' }} />
        <div className="bb-empty-title mt-2">No {kindLabel} yet</div>
        <p className="bb-empty-sub">
          Upload your first PDF — a hunt waiver, a state harvest log template, or a resource handout
          like &ldquo;What to bring on a bear hunt.&rdquo;
        </p>
        <div className="mt-4">
          <Link
            href="/app/docs/new"
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Upload doc
          </Link>
        </div>
      </div>
    </section>
  )
}

function DocRow({ doc }: { doc: DocSummary }) {
  const Icon = doc.kind === 'waiver' ? ClipboardCheck : doc.kind === 'log' ? FileText : BookOpen
  const kindLabel =
    doc.kind === 'waiver' ? 'Waiver' : doc.kind === 'log' ? 'Harvest log' : 'Resource'
  const isArchived = !!doc.archived_at

  // v27.1.0.2: do NOT compose with .bb-trip-row. That class is a 3-column
  // grid (3.25rem date / 1fr body / auto pill) that expects exactly three
  // direct children. Wrapping everything in a single .bb-tile-body shoves
  // every child into column ONE (3.25rem), which is what was crushing the
  // text to ~10px and rendering one character per line. Doc rows have a
  // different anatomy (icon + body + badge), so we use a flat flex layout
  // here with min-width:0 on the body so it actually shrinks instead of
  // forcing min-content overflow.
  return (
    <Link
      href={`/app/docs/${doc.id}`}
      className="bb-tile"
      style={{
        textDecoration: 'none',
        color: 'inherit',
        opacity: isArchived ? 0.6 : 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
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
            fontWeight: 600,
            color: 'var(--color-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.label}
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
            {kindLabel}
            {doc.state ? ` · ${doc.state}` : ''}
            {' · '}Updated {relativeOrDate(doc.updated_at)}
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--color-ink-soft)',
              overflowWrap: 'anywhere',
            }}
          >
            {doc.trip_count > 0
              ? `On ${doc.trip_count} trip${doc.trip_count === 1 ? '' : 's'}`
              : 'Not attached to a trip'}
          </span>
        </div>
      </div>
      <MappingBadge status={doc.mapping_status} archived={isArchived} />
    </Link>
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
  if (status === 'not_applicable') {
    return null
  }
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
  // unmapped or partial
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
