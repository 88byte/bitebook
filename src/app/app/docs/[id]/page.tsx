import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, FileText, BookOpen, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchGuideDoc } from '../../_lib/docs-queries'
import { relativeOrDate } from '../../_lib/format'
import EditDocForm from './EditDocForm'
import DocFilePreview from './DocFilePreview'
import DocActionsBar from './DocActionsBar'
import MappingStatusBadge from '../../_components/MappingStatusBadge'

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
        <>
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
          {/* v27.3.10 item 4: divider directly under the action row
              so the buttons sit clearly above the doc body content. */}
          <div className="bb-page-divider mt-3" aria-hidden="true" />
        </>
      )}

      {/* v27.3.8.1 item 4: "Place signatures" CTA moved into the
          Field mapping section (next to "Edit mapping") and renamed
          to "Set signature locations" so the action verb matches
          what the wizard actually does. The standalone CTA above
          this section was confusing — it sat alone with no header
          context. */}

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

      {/* v27.3.10.5 item 1: Field mapping section + signature
          placement CTA were moved INSIDE EditDocForm so doc metadata
          (Kind / Label / State) and Field mapping setup live in one
          unified window — no longer two adjacent sections that read
          as separate concerns. The mapping section sits under State
          (optional) with a thin divider, and surfaces the colored
          status badge (red Unmapped / amber Partial / green Mapped)
          directly next to the heading.

          Layout split by kind:
          - log:    EditDocForm (with mapping inside) → File preview
          - waiver: File preview → EditDocForm (with mapping inside)
          - resource: File preview → EditDocForm (no mapping section,
            since mapping_status === 'not_applicable' for resources). */}
      {doc.kind === 'log' ? (
        <>
          {viewerOwnsDoc && (
            <section className="mt-4">
              <EditDocForm
                docId={doc.id}
                initial={{
                  kind: doc.kind,
                  label: doc.label,
                  state: doc.state,
                }}
                mappingStatus={doc.mapping_status}
                isArchived={isArchived}
                showSetSignatureButton={true}
                viewerOwnsDoc={viewerOwnsDoc}
              />
            </section>
          )}
          {!viewerOwnsDoc && (
            <section className="mt-4">
              <ReadOnlyMappingSection
                docId={doc.id}
                mappingStatus={doc.mapping_status}
                isArchived={isArchived}
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

          {viewerOwnsDoc && (
            <section className="mt-3">
              <EditDocForm
                docId={doc.id}
                initial={{
                  kind: doc.kind,
                  label: doc.label,
                  state: doc.state,
                }}
                mappingStatus={doc.kind === 'waiver' ? doc.mapping_status : undefined}
                isArchived={isArchived}
                showSetSignatureButton={doc.kind === 'waiver'}
                viewerOwnsDoc={viewerOwnsDoc}
              />
            </section>
          )}
          {!viewerOwnsDoc && doc.kind === 'waiver' && (
            <section className="mt-3">
              <ReadOnlyMappingSection
                docId={doc.id}
                mappingStatus={doc.mapping_status}
                isArchived={isArchived}
              />
            </section>
          )}
        </>
      )}
    </main>
  )
}

// v27.3.10.5 item 1: read-only Field mapping section for template
// viewers (non-owners). Same visual structure as the EditDocForm
// version (heading + status badge + View mapping CTA) but doesn't
// nest inside an editable form tile — non-owners aren't editing
// anything.
function ReadOnlyMappingSection({
  docId,
  mappingStatus,
  isArchived,
}: {
  docId: string
  mappingStatus: string
  isArchived: boolean
}) {
  return (
    <section className="bb-tile bb-form-section bb-form-narrow">
      <div className="bb-tile-body">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: '0.4rem',
          }}
        >
          <h2 className="bb-form-section-head" style={{ marginTop: 0, marginBottom: 0 }}>
            Field mapping
          </h2>
          <MappingStatusBadge status={mappingStatus} archived={isArchived} />
        </div>
        <p className="bb-form-help" style={{ margin: 0 }}>
          See how this template maps PDF boxes to Bite Book data sources. The mapping is owned by the template author.
        </p>
        <div
          style={{
            marginTop: '0.6rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <Link
            href={`/app/docs/${docId}/mapping`}
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            View mapping
          </Link>
        </div>
      </div>
    </section>
  )
}
