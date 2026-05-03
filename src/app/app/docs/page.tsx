import Link from 'next/link'
import { FileText, ClipboardCheck, BookOpen, Plus, AlertCircle, Archive, CheckCircle2, Sparkles } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import {
  fetchGuideDocs,
  fetchGuideDocCounts,
  fetchBiteBookTemplates,
  type DocKind,
  type DocSummary,
} from '../_lib/docs-queries'
import { relativeOrDate } from '../_lib/format'
import DocsLibraryList from './DocsLibraryList'

type SearchParams = Promise<{ kind?: string; archived?: string; just_completed?: string; tab?: string }>

const KIND_FILTERS: { value: DocKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'waiver', label: 'Waivers' },
  { value: 'log', label: 'Logs' },
  { value: 'resource', label: 'Resources' },
]

function isKindFilter(s: string | undefined): s is DocKind | 'all' {
  return s === 'all' || s === 'waiver' || s === 'log' || s === 'resource'
}

// v27.1.1.0.3e.5: top-level tabs — My docs (guide's owned library) vs
// Bite Book templates (admin-curated read-only pool). URL-driven via
// ?tab=, default 'my'. Same pattern as the wallet tabs.
type DocsTab = 'my' | 'templates'
function isDocsTab(s: string | undefined): s is DocsTab {
  return s === 'my' || s === 'templates'
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
  const tab: DocsTab = isDocsTab(sp.tab) ? sp.tab : 'my'

  const [docs, counts, templates] = await Promise.all([
    fetchGuideDocs(profile.id, { kind, includeArchived }),
    fetchGuideDocCounts(profile.id),
    fetchBiteBookTemplates(profile.id),
  ])

  // Templates filtered by kind chip on the templates tab. The fetcher
  // returns the full pool; we narrow client-side for the kind chip + the
  // empty state.
  const filteredTemplates =
    tab === 'templates' && kind !== 'all'
      ? templates.filter((t) => t.kind === kind)
      : templates

  // v27.1.1.0.3d.2.10: success toast after the mapping wizard's
  // "Mark mapping complete" redirect lands here. The query param is
  // the just-completed doc id; we look up its label for the message.
  const justCompletedId = typeof sp.just_completed === 'string' ? sp.just_completed : null
  const justCompletedDoc = justCompletedId
    ? docs.find((d) => d.id === justCompletedId)
    : null

  // Helper to preserve filter chips across tab switches (kind survives the
  // tab toggle since both tabs use the same kind filter).
  function tabHref(target: DocsTab): string {
    const params: string[] = []
    if (target !== 'my') params.push(`tab=${target}`)
    if (kind !== 'all') params.push(`kind=${kind}`)
    if (target === 'my' && includeArchived) params.push('archived=1')
    return params.length === 0 ? '/app/docs' : `/app/docs?${params.join('&')}`
  }

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">Documents</p>
          <h1 className="bb-page-title">
            {tab === 'templates' ? 'Bite Book templates' : 'Your library'}
          </h1>
          <p className="bb-page-sub">
            {tab === 'templates'
              ? 'Pre-built forms shared by Bite Book. Tap to view or use on a trip.'
              : 'Waivers, harvest logs, and resources you can attach to any trip.'}
          </p>
        </div>
        {tab === 'my' && (
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
        )}
      </header>

      {/* v27.1.1.0.3e.5: top-level tabs. My docs vs Bite Book templates.
          Pattern mirrors the wallet tabs — copper underline on active,
          URL-driven so the back button works. */}
      <nav
        className="mt-4 flex gap-4"
        role="tablist"
        aria-label="Docs section"
        style={{ borderBottom: '1px solid var(--color-card-divider)' }}
      >
        <Link
          href={tabHref('my')}
          role="tab"
          aria-selected={tab === 'my'}
          style={{
            padding: '0.5rem 0.25rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: tab === 'my' ? 'var(--color-copper)' : 'var(--color-ink-soft)',
            textDecoration: 'none',
            borderBottom: tab === 'my' ? '2px solid var(--color-copper)' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          My docs
        </Link>
        <Link
          href={tabHref('templates')}
          role="tab"
          aria-selected={tab === 'templates'}
          style={{
            padding: '0.5rem 0.25rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: tab === 'templates' ? 'var(--color-copper)' : 'var(--color-ink-soft)',
            textDecoration: 'none',
            borderBottom: tab === 'templates' ? '2px solid var(--color-copper)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <Sparkles size={14} aria-hidden="true" />
          Bite Book templates
          <span style={{ opacity: 0.65, fontWeight: 500 }}>({templates.length})</span>
        </Link>
      </nav>

      {/* v27.1.1.0.3d.2.10: success toast after Mark mapping complete
          redirects here. Renders only when the query param targets a
          doc the guide currently sees in their library. */}
      {justCompletedDoc && (
        <section
          className="bb-tile mt-3"
          style={{
            padding: '0.75rem 1rem',
            background: 'linear-gradient(180deg, rgba(78, 130, 70, 0.10), rgba(78, 130, 70, 0.02))',
            borderColor: '#3F6B3A',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 size={18} aria-hidden="true" style={{ color: '#3F6B3A' }} />
          <span style={{ fontWeight: 600, color: '#3F6B3A' }}>
            Mapping complete
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
            &ldquo;{justCompletedDoc.label}&rdquo; is ready to use on your trips.
          </span>
        </section>
      )}

      {/* Filter chips. URL-driven so the browser back button works and
          links can be shared. Active state = copper underline matching
          the mobile-tab pattern. Chips work on both tabs — they narrow
          either My docs or templates by kind. The Show-archived toggle
          only appears on My docs (templates don't archive). */}
      <nav
        className="mt-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Filter docs by kind"
      >
        {KIND_FILTERS.map((f) => {
          const active = f.value === kind
          const params: string[] = []
          if (tab !== 'my') params.push(`tab=${tab}`)
          if (f.value !== 'all') params.push(`kind=${f.value}`)
          if (tab === 'my' && includeArchived) params.push('archived=1')
          const href = params.length === 0 ? '/app/docs' : `/app/docs?${params.join('&')}`
          // Counts are per-tab. My docs uses the prebaked counts;
          // templates uses the live filter against the templates pool.
          const count =
            tab === 'my'
              ? counts[f.value]
              : f.value === 'all'
                ? templates.length
                : templates.filter((t) => t.kind === f.value).length
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
        {tab === 'my' && (
          <Link
            href={
              includeArchived
                ? kind === 'all'
                  ? '/app/docs'
                  : `/app/docs?kind=${kind}`
                : kind === 'all'
                  ? '/app/docs?archived=1'
                  : `/app/docs?kind=${kind}&archived=1`
            }
            className={includeArchived ? 'bb-chip is-active' : 'bb-chip'}
            aria-pressed={includeArchived}
            style={{ marginLeft: 'auto' }}
          >
            <Archive size={12} aria-hidden="true" style={{ marginRight: 4 }} />
            {includeArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        )}
      </nav>

      {/* Tab body. My docs gets the bulk-select wrapper; templates gets
          a read-only DocRow list. */}
      {tab === 'my' ? (
        <section className="mt-5">
          {docs.length === 0 ? (
            <EmptyState kind={kind} includeArchived={includeArchived} />
          ) : (
            <DocsLibraryList docs={docs} />
          )}
        </section>
      ) : (
        <section className="mt-5">
          {filteredTemplates.length === 0 ? (
            <div className="bb-tile mt-4">
              <div className="bb-tile-body" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <Sparkles size={32} aria-hidden="true" style={{ color: 'var(--color-copper)', margin: '0 auto' }} />
                <div className="bb-empty-title mt-2">No templates yet</div>
                <p className="bb-empty-sub">
                  {kind === 'all'
                    ? 'Bite Book curates state harvest logs and other forms here as they are added. Check back soon.'
                    : 'No templates in this category yet. Try the All filter, or check back soon.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTemplates.map((d) => (
                <DocRow key={d.id} doc={d} showTemplateBadge />
              ))}
            </div>
          )}
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

function DocRow({
  doc,
  showTemplateBadge = false,
}: {
  doc: DocSummary
  showTemplateBadge?: boolean
}) {
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
          {showTemplateBadge && <TemplateBadge />}
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

// v27.1.1.0.3e: small copper-tinted pill that flags Bite Book template
// rows. Used both in the templates section (every row) and the user's own
// library when a row's is_template=true (so Flavio sees what he's
// published as a template).
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
