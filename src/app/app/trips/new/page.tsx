import Link from 'next/link'
import { ArrowLeft, Bookmark } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchAcceptedHunters } from '../../_lib/queries'
import {
  fetchGuideTripTemplate,
  fetchGuideTripTemplates,
} from '../../_lib/trip-template-queries'
import NewTripForm, { type NewTripInitial } from './NewTripForm'
import UseTemplateButton from './UseTemplateButton'

// v26.4: structured-section layout — the form renders its own per-section
// .bb-tile wrappers, so this page no longer wraps the form in a single tile.
//
// v27.1.4: optional ?template=<id> pre-fills the form with values from
// trip_templates. The form switches its server-action target to
// createTripFromTemplateAction so linked docs auto-attach to the new trip.
type SearchParams = Promise<{ template?: string }>

export default async function NewTripPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile } = await requireGuide()
  const sp = await searchParams
  const templateId = typeof sp.template === 'string' && sp.template.length > 0 ? sp.template : null

  const [hunters, templates, templateData] = await Promise.all([
    fetchAcceptedHunters(profile.id),
    fetchGuideTripTemplates(profile.id, { includeArchived: false }),
    templateId
      ? fetchGuideTripTemplate(profile.id, templateId)
      : Promise.resolve(null),
  ])

  // Build the initial values payload from the template (if present + active).
  // Archived templates won't load here because fetchGuideTripTemplate's
  // owner_id filter passes archived rows through, but the picker only lists
  // active ones — and createTripFromTemplateAction also rejects archived.
  // We keep banner/template_id intact even if the template is archived so
  // the guide gets a clear error on submit; happy path is active-only.
  const initial: NewTripInitial | null = templateData
    ? {
        kind: templateData.template.activity === 'fishing' ? 'fishing' : 'hunting',
        city: templateData.template.city ?? '',
        state: templateData.template.state ?? '',
        zone: templateData.template.location_zone ?? '',
        county: templateData.template.location_county ?? '',
        species_targeted: templateData.template.species_targeted ?? '',
        method: templateData.template.method ?? '',
      }
    : null

  return (
    <main className="bb-app-main">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header>
        <p className="bb-page-eyebrow">Plan a trip</p>
        <h1 className="bb-page-title">New trip</h1>
        <p className="bb-page-sub">
          Set the basics now. You can add harvests, photos, and warden shares once you&rsquo;re in the field.
        </p>
      </header>

      {/* v27.1.4: Use template picker. Hidden when the guide has zero
          active templates so the empty state isn't a dead button. */}
      {templates.length > 0 && (
        <div className="mt-3 flex">
          <UseTemplateButton
            templates={templates}
            activeTemplateId={templateData?.template.id ?? null}
          />
        </div>
      )}

      {/* v27.1.4: when ?template= resolved to a real template, show a
          compact banner above the form. Banner stays visible regardless
          of activity changes — the guide can still tweak. */}
      {templateData && (
        <section
          className="bb-tile mt-3"
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(168, 92, 50, 0.08)',
            borderColor: 'var(--color-copper)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
          role="status"
          aria-live="polite"
        >
          <Bookmark size={16} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
            Using template: {templateData.template.label}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
            Edit fields if needed before saving.
          </span>
        </section>
      )}

      <div className="bb-form-narrow mt-4">
        <NewTripForm
          hunters={hunters}
          initial={initial}
          templateId={templateData ? templateData.template.id : null}
        />
      </div>
    </main>
  )
}
