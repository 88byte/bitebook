import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Share2,
  Activity,
} from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import {
  fetchTripDetail,
  fetchAcceptedHunters,
  fetchSpecies,
} from '../../_lib/queries'
import { fetchHarvestLogSummary } from '../../_lib/harvest-log-queries'
import {
  fetchTripDocsForGuide,
  fetchAttachableDocsForGuide,
} from '../../_lib/trip-doc-queries'
import StatusPill from '../../_components/StatusPill'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'
import CancelTripButton from './CancelTripButton'
import SaveAsTemplateButton from './SaveAsTemplateButton'
import TripDetailEditor from './TripDetailEditor'
import TripDocsCard from './TripDocsCard'

type RouteParams = Promise<{ id: string }>

// v27.1.1.0.3e.6: trip detail IS the edit surface. Read-only DetailCells
// have been replaced with the inline TripDetailEditor (same Trip Overview
// + collapsed Location/Hunt/Hunters/Notes pattern that previously lived
// on /app/trips/[id]/edit). Auto-save on blur — no Save Changes button.
//
// The /edit route now redirects here for back-compat. The hunter side
// (/app/h/trips/[id]) keeps its existing read-only render.
export default async function TripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()

  const detail = await fetchTripDetail(profile.id, id)
  if (!detail) notFound()

  const { trip, participants } = detail
  const [harvestLogSummary, tripDocs, attachableDocs, speciesOptions] = await Promise.all([
    fetchHarvestLogSummary(trip.id),
    fetchTripDocsForGuide(trip.id),
    fetchAttachableDocsForGuide(profile.id),
    // v27.1.3.0.2: full species pool for the Hunt details Species picker
    // inside TripDetailEditor (replaces the plain text input).
    fetchSpecies(),
  ])
  const isOpen = trip.status === 'planned' || trip.status === 'active'
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'

  // Participants list shaped for the Manage actions modal — only those with
  // a real hunter_id + resolved profile (guests can't have actions assigned
  // since RLS keys actions on auth user id).
  const docParticipants: Array<{ id: string; display_name: string }> = []
  for (const p of participants) {
    if (p.hunter_id && p.profile) {
      docParticipants.push({ id: p.profile.id, display_name: p.profile.display_name })
    }
  }

  // Hunters candidate list = union of currently-selected participants +
  // the guide's accepted hunters (so the participants pane shows
  // everyone on the trip even if a previously-accepted invitation has
  // since flipped, plus everyone the guide can add).
  const accepted = await fetchAcceptedHunters(profile.id)
  const candidatesById = new Map<string, { id: string; display_name: string }>()
  for (const a of accepted) candidatesById.set(a.id, a)
  for (const p of participants) {
    if (p.hunter_id && p.profile && !candidatesById.has(p.hunter_id)) {
      candidatesById.set(p.hunter_id, p.profile)
    }
  }
  const candidates = Array.from(candidatesById.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  )
  const initialSelectedIds = participants
    .map((p) => p.hunter_id)
    .filter((v): v is string => !!v)

  return (
    <main className="bb-app-main">
      {/* v27.1.3.0.4: wrap the entire trip-detail column in bb-form-narrow
          so the back link + header + action row + editor + docs card all
          align to the same centered column. Previously the editor and
          docs card were narrow-centered while the action row sat on
          the full <main> width — at 1280px+ the buttons appeared
          left-anchored against an empty right-side gutter. Single
          centered column eliminates the off-balance feel. */}
      <div className="bb-form-narrow">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <p className="bb-page-sub">View and manage trip details. Changes save as you type.</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
        </div>
      </header>

      {/* v27.1.1.0.3e.6: action row — Edit dropped (everything below is
          inline-editable). Wrap up / Cancel / Reopen / Generate hunt
          report stay. */}
      <div
        className="mt-2 flex flex-wrap gap-2"
        aria-label="Trip actions"
        style={{ alignItems: 'center' }}
      >
        {isOpen && <WrapUpTripButton tripId={trip.id} />}
        {isOpen && <CancelTripButton tripId={trip.id} />}
        {isClosed && <ReopenTripButton tripId={trip.id} />}
        <Link
          href={`/app/trips/${trip.id}/log`}
          className="bb-cta-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Activity size={14} aria-hidden="true" />
          {harvestLogSummary.exists ? 'View hunt logs' : 'Generate hunt logs'}
        </Link>
        {/* v27.1.4: Save as template — captures activity / location / hunt
            details + non-log linked docs into a reusable template. Visible
            on active AND wrapped trips (a wrapped trip is often the best
            candidate to template — proven recipe). */}
        {(trip.status === 'active' || trip.status === 'planned' || trip.status === 'completed') && (
          <SaveAsTemplateButton tripId={trip.id} defaultLabel={trip.title} />
        )}
        <button
          type="button"
          className="bb-btn-secondary"
          disabled
          title="Warden share ships later in Sprint 2"
          aria-label="Share with warden (coming soon)"
        >
          <Share2 size={14} aria-hidden="true" />
          Share with warden
        </button>
      </div>

      <div className="mt-4">
        <TripDetailEditor
          tripId={trip.id}
          initial={{
            title: trip.title,
            kind: trip.kind,
            starts_at: trip.starts_at,
            ends_at: trip.ends_at,
            city: trip.city,
            state: trip.state,
            zone: trip.zone,
            county: trip.county,
            species_targeted: trip.species_targeted,
            method: trip.method,
            notes: trip.notes,
          }}
          candidates={candidates}
          initialSelectedIds={initialSelectedIds}
          speciesOptions={speciesOptions}
        />
        {/* v27.1.3.0.4: drop the now-redundant inner bb-form-narrow on
            the docs card — outer wrapper handles the centering. */}
        <TripDocsCard
          tripId={trip.id}
          tripDocs={tripDocs}
          attachable={attachableDocs}
          participants={docParticipants}
        />
      </div>
      </div>
    </main>
  )
}
