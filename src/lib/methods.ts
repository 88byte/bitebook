// v27.0b.4.3: per-activity method options. Same list referenced from
// NewTripForm, EditTripForm, AddHarvestForm, EditHarvestForm so the
// dropdown stays consistent. Filter by trip.kind so a fishing trip
// shows fishing methods only and vice versa.
//
// Stored as the literal display string in trips.method / harvests.method
// (TEXT column, no enum so we can extend without a migration).
export const HUNTING_METHODS = [
  'Rifle',
  'Shotgun',
  'Bow',
  'Crossbow',
  'Muzzleloader',
  'Handgun',
  'Spear',
  'Trap',
] as const

export const FISHING_METHODS = [
  'Fly fishing',
  'Spin/Bait casting',
  'Trolling',
  'Ice fishing',
  'Spearfishing',
  'Bowfishing',
] as const

export type HuntingMethod = (typeof HUNTING_METHODS)[number]
export type FishingMethod = (typeof FISHING_METHODS)[number]
export type MethodOption = HuntingMethod | FishingMethod | 'Other'

// Backward-compat: legacy METHOD_OPTIONS kept as the union of all valid
// values so isValidMethod() can validate any stored row even after we
// later expand either list. Existing rows with v26.3-era values like
// 'N/A' still pass through harmlessly because the type check is loose.
export const METHOD_OPTIONS = [
  ...HUNTING_METHODS,
  ...FISHING_METHODS,
  'Other',
] as const

export function methodsForKind(kind: 'hunting' | 'fishing'): readonly string[] {
  return kind === 'fishing' ? FISHING_METHODS : HUNTING_METHODS
}

export function isValidMethod(value: string): value is MethodOption {
  return (METHOD_OPTIONS as readonly string[]).includes(value)
}
