import { TRIP_STATUS_LABEL, type TripStatus } from '@/lib/labels'

// v27.1.5.3: pulls trip-status display label from the central
// labels.ts map so this is a thin renderer instead of an inline
// vocabulary source.
export default function StatusPill({ status }: { status: TripStatus }) {
  return (
    <span className={`bb-pill bb-pill-${status}`}>{TRIP_STATUS_LABEL[status]}</span>
  )
}
