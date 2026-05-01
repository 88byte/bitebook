import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, FileText, BookOpen } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchGuideDoc } from '../../_lib/docs-queries'
import { relativeOrDate } from '../../_lib/format'
import EditDocForm from './EditDocForm'
import DocFilePreview from './DocFilePreview'

type Params = Promise<{ id: string }>

// v27.1.0 — doc detail page. Edit metadata (label / state / kind), preview
// the uploaded PDF, archive / restore, hard-delete when archived AND not
// attached to any trip. Mapping wizard placeholder card surfaces for waiver
// and log kinds with a "v27.1.1 — coming soon" message.
export default async function DocDetailPage({ params }: { params: Params }) {
  const { profile } = await requireGuide()
  const { id } = await params
  const doc = await fetchGuideDoc(profile.id, id)
  if (!doc) notFound()

  const KindIcon = doc.kind === 'waiver' ? ClipboardCheck : doc.kind === 'log' ? FileText : BookOpen
  const kindLabel = doc.kind === 'waiver' ? 'Waiver' : doc.kind === 'log' ? 'Harvest log' : 'Resource'
  const isArchived = !!doc.archived_at
  const canHardDelete = isArchived && doc.trip_count === 0

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href="/app/docs"
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to library
        </Link>
      </div>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="bb-page-eyebrow"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <KindIcon size={14} aria-hidden="true" />
            {kindLabel}
            {doc.state ? ` · ${doc.state}` : ''}
          </p>
          <h1 className="bb-page-title">{doc.label}</h1>
          <p className="bb-page-sub">
            {doc.trip_count > 0
              ? `Attached to ${doc.trip_count} trip${doc.trip_count === 1 ? '' : 's'} · `
              : 'Not attached to a trip · '}
            Updated {relativeOrDate(doc.updated_at)}
          </p>
        </div>
      </header>

      {isArchived && (
        <section
          className="bb-tile mt-3"
          style={{ borderColor: 'var(--color-ink-tint)' }}
        >
          <div className="bb-tile-body" style={{ padding: '0.75rem' }}>
            <p className="bb-form-help" style={{ margin: 0 }}>
              This doc is archived. It&rsquo;s hidden from your library but still works on trips it&rsquo;s
              already attached to. Restore to put it back in the library, or hard-delete once it&rsquo;s
              detached from every trip.
            </p>
          </div>
        </section>
      )}

      <section className="mt-4">
        <DocFilePreview filePath={doc.file_path} fileMime={doc.file_mime} />
      </section>

      {/* v27.1.1.0: log + waiver field mapping wizard. Waiver signature
          placement still ships in v27.1.2; log auto-fill engine ships in
          v27.1.1.1. The wizard route handles both kinds for now since
          the field-mapping infra is shared. */}
      {doc.kind !== 'resource' && (
        <section
          className="bb-tile mt-3"
          style={{ borderColor: 'var(--color-ink-tint)' }}
        >
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Field mapping</h2>
            <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
              {doc.kind === 'waiver'
                ? 'Map text fields here; signature placement ships next (v27.1.2).'
                : 'Match each PDF field to a Bite Book data source. Auto-fill ships next (v27.1.1.1).'}
            </p>
            <div style={{ marginTop: '0.6rem' }}>
              <Link
                href={`/app/docs/${doc.id}/mapping`}
                className="bb-cta-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {doc.mapping_status === 'unmapped' ? 'Set up mapping' : 'Edit mapping'}
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mt-3">
        <EditDocForm
          docId={doc.id}
          initial={{
            kind: doc.kind,
            label: doc.label,
            state: doc.state,
          }}
          isArchived={isArchived}
          canHardDelete={canHardDelete}
          tripCount={doc.trip_count}
        />
      </section>
    </main>
  )
}
