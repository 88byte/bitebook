import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, FileText, BookOpen, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchGuideDoc } from '../../_lib/docs-queries'
import { relativeOrDate } from '../../_lib/format'
import EditDocForm from './EditDocForm'
import DocFilePreview from './DocFilePreview'
import DocActionsBar from './DocActionsBar'

const ADMIN_EMAIL = 'flaviod022@gmail.com'

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ replaced?: string }>

// v27.1.0 — doc detail page. Edit metadata (label / state / kind), preview
// the uploaded PDF, archive / restore, hard-delete when archived AND not
// attached to any trip. Mapping wizard placeholder card surfaces for waiver
// and log kinds with a "v27.1.1 — coming soon" message.
//
// v27.1.1.0.3e — Bite Book templates: when the viewer is NOT the owning
// guide (i.e. they're looking at an `is_template=true` row from the
// templates section), the page renders read-only — no actions bar, no
// EditDocForm, mapping link is "View mapping" instead of "Set up mapping".
// The mapping wizard's save action is RLS-blocked for non-owners which
// is the desired behavior; we don't add an admin bypass.
export default async function DocDetailPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { user, profile } = await requireGuide()
  const { id } = await params
  const sp = await searchParams
  const doc = await fetchGuideDoc(profile.id, id)
  if (!doc) notFound()

  const viewerOwnsDoc = doc.guide_id === profile.id
  const viewerEmail = user.email ?? null
  const isAdmin = (viewerEmail ?? '').toLowerCase() === ADMIN_EMAIL
  // v27.1.5.3.5: Replace PDF action available to the owning guide and
  // to the admin (Flavio) for any doc, including templates owned by
  // other guides. The button itself is rendered inside DocActionsBar
  // when canReplace=true; the server action does its own owner-or-admin
  // gate as defense-in-depth.
  const canReplace = viewerOwnsDoc || isAdmin
  const replacedFlag = sp.replaced === 'hash_changed' || sp.replaced === 'ok' ? sp.replaced : null

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

      {/* v27.1.1.0.3d.2.6: top action bar — Save changes / Archive
          (or Restore) / Delete forever. Save targets the EditDocForm
          via formId so it works without shared state.
          v27.1.1.0.3e: only render for the owning guide. Non-owner
          template viewers get the read-only banner below instead. */}
      {viewerOwnsDoc && (
        <DocActionsBar
          docId={doc.id}
          isArchived={isArchived}
          canHardDelete={canHardDelete}
          tripCount={doc.trip_count}
          isTemplate={doc.is_template}
          viewerEmail={viewerEmail}
          viewerId={profile.id}
          canReplace={canReplace}
        />
      )}

      {/* v27.2.0.3.1: waiver- and log-class docs both get a "Place
          signatures" link to the drag-place wizard. Mapping-driven
          placements (data_source_path = e_signature.{role} on
          AcroForm signature widgets) take precedence at sign time;
          the wizard is the fallback for PDFs without form fields. */}
      {viewerOwnsDoc && (doc.kind === 'waiver' || doc.kind === 'log') && !isArchived && (
        <div className="mt-3">
          <Link
            href={`/app/docs/${doc.id}/sign-placement`}
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Place signatures
          </Link>
        </div>
      )}

      {/* v27.1.5.3.5: post-replace banner. hash_changed = the new PDF's
          field set differs from the old one, so existing mappings may
          point at fields that no longer exist; nudge a re-run of AI
          mapping. ok = same hash (or first-time replace), no extra
          warning needed — silent confirmation. Both auto-clear when
          the user navigates away (URL param). */}
      {viewerOwnsDoc && replacedFlag === 'hash_changed' && (
        <section
          className="bb-tile mt-3"
          style={{
            padding: '0.75rem 1rem',
            background: '#F2D6CE',
            borderColor: '#8C3C2A',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
          role="status"
        >
          <AlertCircle size={16} aria-hidden="true" style={{ color: '#8C3C2A', flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1, minWidth: 0, color: '#8C3C2A', fontSize: '0.9rem' }}>
            <strong>PDF replaced.</strong> The form fields look different
            from the previous version — your existing field mappings may
            need a quick review.
          </span>
          {(doc.kind === 'log' || doc.kind === 'waiver') && (
            <Link
              href={`/app/docs/${doc.id}/mapping`}
              className="bb-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Review mapping
            </Link>
          )}
        </section>
      )}
      {viewerOwnsDoc && replacedFlag === 'ok' && (
        <section
          className="bb-tile mt-3"
          style={{
            padding: '0.6rem 1rem',
            background: 'rgba(176, 108, 60, 0.08)',
            borderColor: 'var(--color-copper)',
            color: 'var(--color-ink)',
            fontSize: '0.9rem',
          }}
          role="status"
        >
          PDF replaced. Field mappings look unchanged — you’re good.
        </section>
      )}

      {!viewerOwnsDoc && (
        <section
          className="bb-tile mt-3"
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(168, 92, 50, 0.08)',
            borderColor: 'var(--color-copper)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
          role="status"
        >
          <Sparkles
            size={16}
            aria-hidden="true"
            style={{ color: 'var(--color-copper)', flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-copper)' }}>
              Bite Book template
            </div>
            <p
              className="bb-form-help"
              style={{ margin: '0.15rem 0 0 0' }}
            >
              Read-only view. To use this on a trip, attach it from the trip detail.
            </p>
          </div>
        </section>
      )}

      {isArchived && viewerOwnsDoc && (
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

      {/* v27.1.1.0.3d.2.5: log-kind reorder — Field Mapping is the next
          obvious action so it leads. Then editable details, then the
          file preview at the bottom. Waiver + resource keep the prior
          File-first layout. */}
      {doc.kind === 'log' ? (
        <>
          <section
            className="bb-tile mt-4"
            style={{ borderColor: 'var(--color-copper)' }}
          >
            <div className="bb-tile-body">
              <h2 className="bb-form-section-head">Field mapping</h2>
              <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
                {viewerOwnsDoc
                  ? 'Match each PDF box to a Bite Book data source so the auto-fill engine knows what to write into your reports. AI can pre-fill suggestions you review — this is the next step.'
                  : 'See how this template maps PDF boxes to Bite Book data sources. The mapping is owned by the template author.'}
              </p>
              <div style={{ marginTop: '0.6rem' }}>
                <Link
                  href={`/app/docs/${doc.id}/mapping`}
                  className="bb-cta-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {viewerOwnsDoc
                    ? doc.mapping_status === 'unmapped'
                      ? 'Set up mapping'
                      : 'Edit mapping'
                    : 'View mapping'}
                </Link>
                <span style={{ marginLeft: '0.6rem', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
                  Status: <strong>{doc.mapping_status}</strong>
                </span>
              </div>
            </div>
          </section>

          {viewerOwnsDoc && (
            <section className="mt-3">
              <EditDocForm
                docId={doc.id}
                initial={{
                  kind: doc.kind,
                  label: doc.label,
                  state: doc.state,
                }}
              />
            </section>
          )}

          <section className="mt-3">
            <DocFilePreview filePath={doc.file_path} fileMime={doc.file_mime} />
          </section>
        </>
      ) : (
        <>
          <section className="mt-4">
            <DocFilePreview filePath={doc.file_path} fileMime={doc.file_mime} />
          </section>

          {doc.kind === 'waiver' && (
            <section
              className="bb-tile mt-3"
              style={{ borderColor: 'var(--color-ink-tint)' }}
            >
              <div className="bb-tile-body">
                <h2 className="bb-form-section-head">Field mapping</h2>
                <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
                  {viewerOwnsDoc
                    ? 'Map text fields here; signature placement ships next (v27.1.2).'
                    : 'See how this template maps text fields.'}
                </p>
                <div style={{ marginTop: '0.6rem' }}>
                  <Link
                    href={`/app/docs/${doc.id}/mapping`}
                    className="bb-cta-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    {viewerOwnsDoc
                      ? doc.mapping_status === 'unmapped'
                        ? 'Set up mapping'
                        : 'Edit mapping'
                      : 'View mapping'}
                  </Link>
                </div>
              </div>
            </section>
          )}

          {viewerOwnsDoc && (
            <section className="mt-3">
              <EditDocForm
                docId={doc.id}
                initial={{
                  kind: doc.kind,
                  label: doc.label,
                  state: doc.state,
                }}
              />
            </section>
          )}
        </>
      )}
    </main>
  )
}
