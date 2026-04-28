import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireGuide } from '../../../_lib/auth'
import { fetchTripDetail, fetchAcceptedHunters } from '../../../_lib/queries'
import EditTripForm from './EditTripForm'

type RouteParams = Promise<{ id: string }>

// v26.3: edit-trip route. Pre-fills from fetchTripDetail (already pulls
// species_targeted + method + city/state/zone/county/notes). The hunter
// candidate list is the union of currently-selected participants + the
// guide's accepted hunters, so the participants pane shows everyone who
// is on the trip (even if a previously-accepted invitation was later
// removed) plus everyone the guide can add.
export default async function EditTripPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()

  const detail = await fetchTripDetail(profile.id, id)
  if (!detail) notFound()

  const accepted = await fetchAcceptedHunters(profile.id)

  // Build candidates: union of accepted hunters and existing participant
  // profiles. The participant list may include hunters whose invitation has
  // since flipped to 'removed' — keep them visible so the guide can choose
  // to drop them via the unchecked checkbox.
  const candidatesById = new Map<string, { id: string; display_name: string }>()
  for (const a of accepted) candidatesById.set(a.id, a)
  for (const p of detail.participants) {
    if (p.hunter_id && p.profile && !candidatesById.has(p.hunter_id)) {
      candidatesById.set(p.hunter_id, p.profile)
    }
  }
  const candidates = Array.from(candidatesById.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  )

  const initialSelectedIds = detail.participants
    .map((p) => p.hunter_id)
    .filter((v): v is string => !!v)

  return (
    <main className="bb-app-main">
      <Link
        href={`/app/trips/${id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Back to trip
      </Link>

      <header>
        <p className="bb-page-eyebrow">Edit trip</p>
        <h1 className="bb-page-title">{detail.trip.title}</h1>
        <p className="bb-page-sub">Update trip details, hunters, or notes.</p>
      </header>

      <div className="bb-form-narrow">
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <EditTripForm
              tripId={id}
              initial={{
                title: detail.trip.title,
                kind: detail.trip.kind,
                starts_at: detail.trip.starts_at,
                ends_at: detail.trip.ends_at,
                city: detail.trip.city,
                state: detail.trip.state,
                zone: detail.trip.zone,
                county: detail.trip.county,
                species_targeted: detail.trip.species_targeted,
                method: detail.trip.method,
                notes: detail.trip.notes,
              }}
              candidates={candidates}
              initialSelectedIds={initialSelectedIds}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
