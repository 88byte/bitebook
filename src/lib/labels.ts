// v27.1.5.3 — central status label map.
//
// Status vocabulary alignment across trips / wallet / docs so the same
// word means the same thing everywhere a hunter or guide reads it.
//
// DB enum values are kept as-is (no migration). Only display strings
// shift here, so call sites that rendered old labels ("Pre-trip", "In
// field", "Wrapped", "Tagged out") now read from these maps.
//
// Rules:
//   Active     = ready / usable. Trip planned-but-not-started, valid
//                wallet items, usable docs.
//   In progress = unique to trips, the field-active state. DB column
//                stays 'active' but UI always reads "In progress".
//   Done       = finished. Trip completed, wallet tag tagged-out.
//   Canceled   = trips that didn't happen. Unchanged.
//   Expired    = wallet items past valid_to. Unchanged.
//   Archived   = manual hide. Wallet + docs.

import type { Database } from '@/lib/supabase/types'

export type TripStatus = Database['public']['Enums']['trip_status']

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  planned: 'Active',
  active: 'In progress',
  completed: 'Done',
  canceled: 'Canceled',
}

// Wallet items use a derived status (deriveStatus in wallet-utils.ts):
// 'active' | 'used' | 'expired' | 'archived'. 'used' maps to "Done"
// in the new vocabulary (a tagged-out tag is finished business),
// matching how a wrapped trip reads.
export type WalletDerivedStatus = 'active' | 'used' | 'expired' | 'archived'

export const WALLET_STATUS_LABEL: Record<WalletDerivedStatus, string> = {
  active: 'Active',
  used: 'Done',
  expired: 'Expired',
  archived: 'Archived',
}

// Trip filter chip labels (trips list page). Same as the pill labels
// plus an "All" entry. Kept here so adding a new trip status only
// requires touching one file.
export const TRIP_FILTER_LABEL: Record<TripStatus | 'all', string> = {
  all: 'All',
  ...TRIP_STATUS_LABEL,
}
