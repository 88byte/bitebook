import Link from 'next/link'
import { ArrowLeft, Bookmark, Plus } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchAcceptedHunters, fetchSpecies } from '../../_lib/queries'
import { fetchAttachableDocsForGuide } from '../../_lib/trip-doc-queries'
import {
  fetchGuideTripTemplate,
  fetchGuideTripTemplates,
} from '../../_lib/trip-template-queries'
import NewTripForm, { type NewTripInitial } from './NewTripForm'
import UseTemplateButton from './UseTemplateButton'
import LeadAssistPicker from './LeadAssistPicker'
import { fetchOrgGuideRoster } from '../../_lib/calendar-queries'

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

  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id

  const [hunters, templates, templateData, speciesOptions, attachableDocs, roster] = await Promise.all([
    fetchAcceptedHunters(profile.id),
    fetchGuideTripTemplates(profile.id, { includeArchived: false }),
    templateId
      ? fetchGuideTripTemplate(profile.id, templateId)
      : Promise.resolve(null),
    fetchSpecies(),
    // v27.6.2.1 — pre-creation docs picker pulls from the same source
    // as /app/trips/[id]'s post-creation TripDocsCard.
    fetchAttachableDocsForGuide(profile.id),
    isOutfitterMember && profile.current_outfitter_org_id
      ? fetchOrgGuideRoster(profile.current_outfitter_org_id)
      : Promise.resolve([]),
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

      {/* v27.3.3.1: action row + Use template on the same action row,
          ABOVE the divider. Use template was below the divider in
          v27.3.3 — Flavio: "buttons should be above the divider."
          Both submit-style actions live in this row.
          v28.0.1: submit button copy switched from "Create trip" to
          "Save" to disambiguate from the page-level /app/trips
          "Create trip" navigation CTA that brought the user into
          this form. Same button, clearer signal that it commits the
          form rather than starting a new flow. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          form="new-trip-form"
          className="bb-cta-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Plus size={16} aria-hidden="true" />
          Save
        </button>
        {templates.length > 0 && (
          <UseTemplateButton
            templates={templates}
            activeTemplateId={templateData?.template.id ?? null}
          />
        )}
      </div>

      {/* v27.6.2 — page-divider dropped to match /app/trips/[id]
          (which goes straight from action row to first tile with
          no horizontal rule between). Keeps the create flow visually
          aligned with the trip detail surface. */}

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

      {/* v27.6.2.1 — drops bb-form-narrow so the form can span the
          full bb-trip-detail-grid 2-col layout (matches /app/trips/[id]).
          v27.9.13 — key prop forces NewTripForm to remount when the
          ?template= query string changes (Path B: user clicks Use
          Template while already on /app/trips/new). Without the key
          React keeps the previously-mounted form instance and its
          useState / uncontrolled defaultValue inputs ignore the new
          `initial` prop — so state/species/method/city/zone/county
          stay stuck at the empty Path B values even after navigation
          re-fetches the template. Remount via key clears state +
          re-runs initializers with the new initial. */}
      <div className="mt-4">
        <NewTripForm
          key={templateData ? `t:${templateData.template.id}` : 'no-template'}
          hunters={hunters}
          initial={initial}
          templateId={templateData ? templateData.template.id : null}
          templateDocIds={templateData ? templateData.doc_ids : null}
          speciesOptions={speciesOptions}
          attachableDocs={attachableDocs}
        />
        {isOutfitterMember && roster.length > 0 && (
          <LeadAssistPicker
            roster={roster}
            defaultLeadId={profile.id}
          />
        )}
      </div>
    </main>
  )
}
