import Link from 'next/link'
import StatusPill from '../../_components/StatusPill'
import { tripDay, tripMonth, tripDateRange, formatTripLocation } from '../../_lib/format'
import type { Database } from '@/lib/supabase/types'

type Trip = Pick<
  Database['public']['Tables']['trips']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind' | 'city' | 'state' | 'zone' | 'county'
>

// v25.1: hunter-side trip row. Same visuals as the guide TripRow but the
// href targets /app/h/trips/[id] (read-only hunter detail).
// v26.4: multi-line metadata to mirror TripRow.
export default function HunterTripRow({
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
  const counts = `${hunters} ${hunters === 1 ? 'hunter' : 'hunters'} · ${harvests} ${harvests === 1 ? 'harvest' : 'harvests'}`

  return (
    <Link href={`/app/h/trips/${trip.id}`} className="bb-trip-row" aria-label={trip.title}>
      <div className="bb-trip-date" aria-hidden="true">
        <span className="m">{tripMonth(trip.starts_at)}</span>
        <span className="d">{tripDay(trip.starts_at)}</span>
      </div>
      <div className="bb-trip-body">
        <div className="bb-trip-title">{trip.title}</div>
        <div className="bb-trip-meta">
          <span className="bb-trip-meta-line">{dateLabel}</span>
          <span className="bb-trip-meta-line">{locLabel}</span>
          <span className="bb-trip-meta-counts">{counts}</span>
        </div>
      </div>
      <StatusPill status={trip.status} />
    </Link>
  )
}
