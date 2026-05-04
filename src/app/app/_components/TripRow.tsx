import Link from 'next/link'
import { Calendar, MapPin, Users, Star } from 'lucide-react'
import StatusPill from './StatusPill'
import TripDateBlock from './TripDateBlock'
import { tripDay, tripMonth, tripDateRange, formatTripLocation } from '../_lib/format'
import type { Database } from '@/lib/supabase/types'

type Trip = Pick<
  Database['public']['Tables']['trips']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind' | 'city' | 'state' | 'zone' | 'county'
>

// v26.5.4: trip card matched to Flavio's IMG_6597 mockup. Date column on
// the left (month + big day), title + 2x2 meta grid in the middle, status
// pill on the right.
//
// v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending).
// The harvest count cell + prop have been removed; the meta grid is now a
// 3-cell row (date / location / hunters) until the new harvest_log
// counter wires in.
//
// Locked icon family per Flavio's icon-consistency rule:
//   Calendar + date-range, MapPin + location, Users + hunter count
//
// v26.5.9: wrapped trips (status completed|canceled) render an additional
// star row below the meta grid. Guide cards show the AVERAGE rating across
// every hunter who reviewed the trip + total review count. Single hunter →
// shows that one rating. Zero reviews → outlined stars + "Pending review".
export default function TripRow({
  trip,
  hunters,
  rating = null,
  reviewCount = 0,
}: {
  trip: Trip
  hunters: number
  rating?: number | null
  reviewCount?: number
}) {
  const dateLabel = tripDateRange(trip.starts_at, trip.ends_at)
  const locLabel = formatTripLocation(trip) || (trip.kind === 'fishing' ? 'Fishing' : 'Hunting')
  const huntersLabel = `${hunters} ${hunters === 1 ? 'hunter' : 'hunters'}`
  const isWrapped = trip.status === 'completed' || trip.status === 'canceled'

  return (
    <Link href={`/app/trips/${trip.id}`} className="bb-trip-row" aria-label={trip.title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bb-card-watermark.png"
        alt=""
        aria-hidden="true"
        className="bb-trip-card-watermark"
      />
      <TripDateBlock month={tripMonth(trip.starts_at)} day={tripDay(trip.starts_at)} />
      <div className="bb-trip-body">
        <div className="bb-trip-title">{trip.title}</div>
        <div className="bb-trip-meta">
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <Calendar size={14} strokeWidth={1.5} />
            </span>
            <span className="bb-trip-meta-cell-text">{dateLabel}</span>
          </span>
          <span className="bb-trip-meta-cell bb-trip-meta-cell--location">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <MapPin size={14} strokeWidth={1.5} />
            </span>
            <span className="bb-trip-meta-cell-text">{locLabel}</span>
          </span>
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <Users size={14} strokeWidth={1.5} />
            </span>
            <span className="bb-trip-meta-cell-text">{huntersLabel}</span>
          </span>
        </div>
        {isWrapped && (
          <RatingRow
            rating={rating}
            reviewCount={reviewCount}
            kind="guide"
          />
        )}
      </div>
      <StatusPill status={trip.status} />
      {/* v27.3.3 — desktop-only location pin: same content as the
          inline location cell (which hides itself at >=1024px),
          rendered at the bottom-right corner of the card. */}
      <span className="bb-trip-loc-pin" aria-hidden="true">
        <MapPin size={13} strokeWidth={1.5} />
        {locLabel}
      </span>
    </Link>
  )
}

function RatingRow({
  rating,
  reviewCount,
  kind,
}: {
  rating: number | null
  reviewCount: number
  kind: 'guide' | 'hunter'
}) {
  const filled = rating != null ? Math.round(rating) : 0
  const hasRating = rating != null && rating > 0

  return (
    <div className="bb-trip-rating">
      <span className="bb-trip-rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const isFilled = n <= filled
          return (
            <Star
              key={n}
              size={14}
              strokeWidth={1.75}
              fill={isFilled ? 'currentColor' : 'none'}
              className={isFilled ? undefined : 'bb-trip-rating-star-empty'}
            />
          )
        })}
      </span>
      {hasRating ? (
        <span className="bb-trip-rating-text">
          {kind === 'guide' && reviewCount > 0
            ? `${rating!.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`
            : rating!.toFixed(1)}
        </span>
      ) : (
        <span className="bb-trip-rating-empty">
          {kind === 'hunter' ? 'Rate this trip' : 'Pending review'}
        </span>
      )}
    </div>
  )
}
