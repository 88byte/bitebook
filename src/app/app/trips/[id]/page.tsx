import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Plus, Share2, Lock, Pencil } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchTripDetail } from '../../_lib/queries'
import StatusPill from '../../_components/StatusPill'
import { closeTripAction } from '../actions'
import { tripDateRange, timeOfDay, initials, relativeOrDate } from '../../_lib/format'

type RouteParams = Promise<{ id: string }>

export default async function TripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()

  const detail = await fetchTripDetail(profile.id, id)
  if (!detail) notFound()

  const { trip, participants, harvests } = detail
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'

  return (
    <main className="bb-app-main">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <div className="bb-meta-row mt-1.5">
            <span>{tripDateRange(trip.starts_at, trip.ends_at)}</span>
            {trip.location_name && (
              <>
                <span className="sep">·</span>
                <span>{trip.location_name}</span>
              </>
            )}
            <span className="sep">·</span>
            <span>{participants.length} {participants.length === 1 ? 'hunter' : 'hunters'}</span>
            <span className="sep">·</span>
            <span>{harvests.length} {harvests.length === 1 ? 'harvest' : 'harvests'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
          <button
            type="button"
            className="bb-btn-secondary"
            disabled
            title="Trip editing ships in slice 2"
            aria-label="Edit trip (coming soon)"
          >
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        </div>
      </header>

      <section aria-labelledby="trip-actions">
        <h2 id="trip-actions" className="sr-only">Trip actions</h2>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            className="bb-cta-sm"
            disabled
            title="Harvest entry ships in slice 2"
            aria-label="Add harvest (coming soon)"
          >
            <Plus size={14} aria-hidden="true" />
            Add harvest
          </button>
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
          {!isClosed && (
            <form action={closeTripAction}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <button type="submit" className="bb-btn-secondary">
                <Lock size={14} aria-hidden="true" />
                Mark closed
              </button>
            </form>
          )}
        </div>
      </section>

      <section aria-labelledby="trip-hunters">
        <h2 id="trip-hunters" className="bb-section-title">Hunters</h2>
        {participants.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No hunters yet</div>
            <p className="bb-empty-sub">
              Add hunters to this trip — they&rsquo;ll see the active-hunt view from their phone.
            </p>
          </div>
        ) : (
          <div className="bb-detail-list">
            {participants.map((p) => {
              const name = p.profile?.display_name ?? p.guest_name ?? 'Unnamed hunter'
              return (
                <div key={p.id} className="bb-detail-row">
                  <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bb-detail-name">{name}</div>
                    <div className="bb-detail-sub">
                      {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="trip-harvests">
        <h2 id="trip-harvests" className="bb-section-title">Harvest log</h2>
        {harvests.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No harvests logged</div>
            <p className="bb-empty-sub">
              Once you&rsquo;re in the field, log harvests with photo + tag. They sync when you have signal.
            </p>
          </div>
        ) : (
          <div className="bb-detail-list">
            {harvests.map((h) => {
              const hunterName = h.hunter_name ?? 'Unknown hunter'
              const species = h.species_name ?? (h.kind === 'fishing' ? 'Catch' : 'Harvest')
              return (
                <div key={h.id} className="bb-detail-row">
                  <span className="bb-avatar" aria-hidden="true">{initials(hunterName)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bb-detail-name">
                      {species}
                      {h.tag_number ? <span style={{ color: 'var(--color-ink-soft)' }}> · Tag {h.tag_number}</span> : null}
                    </div>
                    <div className="bb-detail-sub">
                      {hunterName} · {timeOfDay(h.harvested_at)} · {relativeOrDate(h.harvested_at)}
                    </div>
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
    </main>
  )
}
