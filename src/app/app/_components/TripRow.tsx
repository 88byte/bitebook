import Link from 'next/link'
import { Calendar, MapPin, Users, Trophy } from 'lucide-react'
import StatusPill from './StatusPill'
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
// 2x2 meta grid uses the same lucide icon family locked in for trip detail
// (per Flavio's icon-consistency rule):
//   row 1: Calendar + date-range,   MapPin + location
//   row 2: Users    + hunter count, Trophy + harvest count
export default function TripRow({
  trip,
  hunters,
  harvests,
}: {
  trip: Trip
  hunters: number
  harvests: number
}) {
  const dateLabel = tripDateRange(trip.starts_at, trip.ends_at)
  const locLabel = formatTripLocation(trip) || (trip.kind === 'fishing' ? 'Fishing' : 'Hunting')
  const huntersLabel = `${hunters} ${hunters === 1 ? 'hunter' : 'hunters'}`
  const harvestsLabel = `${harvests} ${harvests === 1 ? 'harvested' : 'harvested'}`

  return (
    <Link href={`/app/trips/${trip.id}`} className="bb-trip-row" aria-label={trip.title}>
      <div className="bb-trip-date" aria-hidden="true">
        <span className="m">{tripMonth(trip.starts_at)}</span>
        <span className="d">{tripDay(trip.starts_at)}</span>
      </div>
      <div className="bb-trip-body">
        <div className="bb-trip-title">{trip.title}</div>
        <div className="bb-trip-meta">
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <Calendar size={14} />
            </span>
            <span className="bb-trip-meta-cell-text">{dateLabel}</span>
          </span>
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <MapPin size={14} />
            </span>
            <span className="bb-trip-meta-cell-text">{locLabel}</span>
          </span>
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <Users size={14} />
            </span>
            <span className="bb-trip-meta-cell-text">{huntersLabel}</span>
          </span>
          <span className="bb-trip-meta-cell">
            <span className="bb-trip-meta-cell-icon" aria-hidden="true">
              <Trophy size={14} />
            </span>
            <span className="bb-trip-meta-cell-text">{harvestsLabel}</span>
          </span>
        </div>
      </div>
      <StatusPill status={trip.status} />
    </Link>
  )
}
