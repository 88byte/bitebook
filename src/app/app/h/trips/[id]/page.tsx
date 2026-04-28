import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireHunter } from '../../../_lib/auth'
import { fetchHunterTripDetail, fetchHunterTripReview } from '../../../_lib/queries'
import StatusPill from '../../../_components/StatusPill'
import { tripDateRange, timeOfDay, initials, relativeOrDate, formatTripLocation } from '../../../_lib/format'
import { markStepDone } from '../../../_lib/onboarding'
import ReviewForm from './ReviewForm'

type RouteParams = Promise<{ id: string }>

// v25.1: hunter-side read-only trip detail. No edit, no add-harvest, no
// close-trip controls — those are guide-side actions.
//
// v26.0: best-effort marks the `first_trip_viewed` onboarding step done on
// each successful render, and (for completed trips) renders ReviewForm so
// the hunter can leave a 1-5 star review.
export default async function HunterTripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { supabase, profile } = await requireHunter()

  const detail = await fetchHunterTripDetail(profile.id, id)
  if (!detail) notFound()

  // v26.0: best-effort onboarding mark. If it fails (RLS, transient), the
  // step will be marked the next time the hunter opens any trip detail.
  try {
    await markStepDone(supabase, profile.id, 'first_trip_viewed')
  } catch (e) {
    console.warn('[h.trips.detail] markStepDone failed', e)
  }

  const isCompleted = detail.trip.status === 'completed'
  const existingReview = isCompleted ? await fetchHunterTripReview(profile.id, id) : null
  const canEdit = existingReview
    ? Date.now() - new Date(existingReview.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
    : true

  const { trip, guide, participants, myHarvests } = detail
  const guideLabel = guide ? (guide.business_name?.trim() || guide.display_name) : 'Your guide'

  return (
    <main className="bb-app-main">
      <Link
        href="/app/h/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        My trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <div className="bb-meta-row mt-1.5">
            <span>{tripDateRange(trip.starts_at, trip.ends_at)}</span>
            {(() => {
              const loc = formatTripLocation(trip)
              return loc ? (
                <>
                  <span className="sep">·</span>
                  <span>{loc}</span>
                </>
              ) : null
            })()}
            <span className="sep">·</span>
            <span>{participants.length} {participants.length === 1 ? 'hunter' : 'hunters'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
        </div>
      </header>

      <section aria-labelledby="trip-guide">
        <h2 id="trip-guide" className="bb-section-title">Guide</h2>
        <div className="bb-detail-list">
          <div className="bb-detail-row">
            <span className="bb-avatar" aria-hidden="true">{initials(guideLabel)}</span>
            <div className="flex-1 min-w-0">
              <div className="bb-detail-name">{guideLabel}</div>
              {guide?.business_name && guide?.display_name && (
                <div className="bb-detail-sub">{guide.display_name}</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="trip-my-harvests">
        <h2 id="trip-my-harvests" className="bb-section-title">Your harvests</h2>
        {myHarvests.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No harvests on this trip</div>
            <p className="bb-empty-sub">
              Harvests your guide logs for you will show up here.
            </p>
          </div>
        ) : (
          <div className="bb-detail-list">
            {myHarvests.map((h) => {
              const species = h.species_name ?? (h.kind === 'fishing' ? 'Catch' : 'Harvest')
              return (
                <div key={h.id} className="bb-detail-row">
                  <span className="bb-avatar" aria-hidden="true">{initials(species)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bb-detail-name">
                      {species}
                      {h.tag_number ? <span style={{ color: 'var(--color-ink-soft)' }}> · Tag {h.tag_number}</span> : null}
                    </div>
                    <div className="bb-detail-sub">
                      {timeOfDay(h.harvested_at)} · {relativeOrDate(h.harvested_at)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="trip-other-hunters">
        <h2 id="trip-other-hunters" className="bb-section-title">Other hunters</h2>
        {participants.filter((p) => p.hunter_id !== profile.id).length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">Just you on this trip</div>
            <p className="bb-empty-sub">No other hunters were added to this trip.</p>
          </div>
        ) : (
          <div className="bb-detail-list">
            {participants
              .filter((p) => p.hunter_id !== profile.id)
              .map((p) => {
                const name = p.profile?.display_name ?? p.guest_name ?? 'Hunter'
                return (
                  <div key={p.id} className="bb-detail-row">
                    <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="bb-detail-name">{name}</div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      {trip.notes && (
        <section aria-labelledby="trip-notes">
          <h2 id="trip-notes" className="bb-section-title">Notes</h2>
          <div className="bb-tile">
            <div className="bb-tile-body">
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-ink-muted)' }}>
                {trip.notes}
              </p>
            </div>
          </div>
        </section>
      )}

      {isCompleted && (
        <ReviewForm
          tripId={trip.id}
          existingReview={existingReview}
          canEdit={canEdit}
        />
      )}
    </main>
  )
}
