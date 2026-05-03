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
} from '../../_lib/queries'
import { fetchHarvestLogSummary } from '../../_lib/harvest-log-queries'
import StatusPill from '../../_components/StatusPill'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'
import CancelTripButton from './CancelTripButton'
import TripDetailEditor from './TripDetailEditor'

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
  const harvestLogSummary = await fetchHarvestLogSummary(trip.id)
  const isOpen = trip.status === 'planned' || trip.status === 'active'
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'

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
          {harvestLogSummary.exists ? 'View hunt report' : 'Generate hunt report'}
        </Link>
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
        />
      </div>
    </main>
  )
}
