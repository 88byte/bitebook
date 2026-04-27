import Link from 'next/link'
import StatusPill from '../../_components/StatusPill'
import { tripDay, tripMonth, tripDateRange } from '../../_lib/format'
import type { Database } from '@/lib/supabase/types'

type Trip = Pick<
  Database['public']['Tables']['trips']['Row'],
  'id' | 'title' | 'status' | 'starts_at' | 'ends_at' | 'location_name' | 'kind'
>

// v25.1: hunter-side trip row. Same visuals as the guide TripRow but the
// href targets /app/h/trips/[id] (read-only hunter detail).
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
  const meta = [
    dateLabel,
    trip.location_name?.trim() || (trip.kind === 'fishing' ? 'Fishing' : 'Hunting'),
    `${hunters} ${hunters === 1 ? 'hunter' : 'hunters'}`,
    `${harvests} ${harvests === 1 ? 'harvest' : 'harvests'}`,
  ].join(' · ')

  return (
    <Link href={`/app/h/trips/${trip.id}`} className="bb-trip-row" aria-label={trip.title}>
      <div className="bb-trip-date" aria-hidden="true">
        <span className="m">{tripMonth(trip.starts_at)}</span>
        <span className="d">{tripDay(trip.starts_at)}</span>
      </div>
      <div className="bb-trip-body">
        <div className="bb-trip-title">{trip.title}</div>
        <div className="bb-trip-meta">{meta}</div>
      </div>
      <StatusPill status={trip.status} />
    </Link>
  )
}
