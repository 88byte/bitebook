import Link from 'next/link'
import { Calendar, MapPin, Users, Star } from 'lucide-react'
import StatusPill from '../../_components/StatusPill'
import TripDateBlock from '../../_components/TripDateBlock'
import { tripDay, tripMonth, tripDateRange, formatTripLocation } from '../../_lib/format'
import type { Database } from '@/lib/supabase/types'

type Trip = Pick<
  Database['public']['Tables']['trips']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind' | 'city' | 'state' | 'zone' | 'county'
>

// v25.1: hunter-side trip row. Same visuals as the guide TripRow but the
// href targets /app/h/trips/[id] (read-only hunter detail).
// v27.1.1.0.3a: harvests dropped, real implementation in harvest-log-queries.ts (pending).
// The harvest count cell + prop have been removed; the meta grid is now a
// 3-cell row (date / location / hunters).
// v26.5.9: wrapped trips show the hunter's OWN star rating (not the trip
// average — that's on guide-side cards). If they haven't rated yet, the
// row shows outlined stars + "Rate this trip" hint. Pre-trip / in-field
// trips render no rating row.
export default function HunterTripRow({
  trip,
  hunters,
  rating = null,
}: {
  trip: Trip
  hunters: number
  rating?: number | null
}) {
  const dateLabel = tripDateRange(trip.starts_at, trip.ends_at)
  const locLabel = formatTripLocation(trip) || (trip.kind === 'fishing' ? 'Fishing' : 'Hunting')
  const huntersLabel = `${hunters} ${hunters === 1 ? 'hunter' : 'hunters'}`
  const isWrapped = trip.status === 'completed' || trip.status === 'canceled'

  return (
    <Link href={`/app/h/trips/${trip.id}`} className="bb-trip-row" aria-label={trip.title}>
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
          <span className="bb-trip-meta-cell">
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
        {isWrapped && <HunterRatingRow rating={rating} />}
      </div>
      <StatusPill status={trip.status} />
    </Link>
  )
}

function HunterRatingRow({ rating }: { rating: number | null }) {
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
        <span className="bb-trip-rating-text">{rating!.toFixed(1)}</span>
      ) : (
        <span className="bb-trip-rating-empty">Rate this trip</span>
      )}
    </div>
  )
}
