import type { Database } from '@/lib/supabase/types'

type TripStatus = Database['public']['Enums']['trip_status']

const LABELS: Record<TripStatus, string> = {
  planned: 'Pre-trip',
  active: 'In field',
  completed: 'Wrapped',
  canceled: 'Canceled',
}

export default function StatusPill({ status }: { status: TripStatus }) {
  return (
    <span className={`bb-pill bb-pill-${status}`}>{LABELS[status]}</span>
  )
}
