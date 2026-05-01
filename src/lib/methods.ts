// v27.0b.4.3 / .4.4: per-activity method options. Same list referenced from
// NewTripForm, EditTripForm, AddHarvestForm, EditHarvestForm so the dropdown
// stays consistent. Filter by trip.kind so a fishing trip shows fishing
// methods only and vice versa.
//
// v27.0b.4.4 corrections after agency-source audit (CA DFW, CO CPW,
// MT FWP, WY WGFD, AK ADFG):
//   - "Bow" → "Archery" — "Archery" is the universal regulation term used
//     on every western state harvest form. "Bow" reads like equipment.
//   - Dropped "Spear" — vanishingly rare for big game; if it shows up at
//     all it's small game / fish, confusing in a hunting list.
//   - Dropped "Trap" — trapping is a separate license in every western
//     state and shouldn't share a dropdown with method-of-take for hunting.
//
// Stored as the literal display string in trips.method / harvests.method
// (TEXT column, no enum so we can extend without a migration).
export const HUNTING_METHODS = [
  'Rifle',
  'Shotgun',
  'Archery',
  'Crossbow',
  'Muzzleloader',
  'Handgun',
  'Other',
] as const

export const FISHING_METHODS = [
  'Fly fishing',
  'Spin/Bait casting',
  'Trolling',
  'Ice fishing',
  'Spearfishing',
  'Bowfishing',
  'Other',
] as const

// Legacy values still acceptable to isValidMethod() so harvests / trips
// saved under earlier builds (v26.3 — v27.0b.4.3) don't fail validation
// on edit. Not surfaced in any dropdown.
const LEGACY_METHODS = ['Bow', 'Spear', 'Trap', 'N/A'] as const

export type HuntingMethod = (typeof HUNTING_METHODS)[number]
export type FishingMethod = (typeof FISHING_METHODS)[number]
export type MethodOption = HuntingMethod | FishingMethod

// Backward-compat: METHOD_OPTIONS is the union of canonical + legacy used
// only for isValidMethod(). Do NOT iterate this in a UI dropdown — use
// methodsForKind() so the user sees an activity-appropriate list.
export const METHOD_OPTIONS = [
  ...HUNTING_METHODS,
  ...FISHING_METHODS,
  ...LEGACY_METHODS,
] as const

export function methodsForKind(kind: 'hunting' | 'fishing'): readonly string[] {
  return kind === 'fishing' ? FISHING_METHODS : HUNTING_METHODS
}

export function isValidMethod(value: string): boolean {
  return (METHOD_OPTIONS as readonly string[]).includes(value)
}
