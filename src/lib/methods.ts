// v27.0b.4.3 / .4.4 / .4.5: per-activity method options. Same list referenced
// from NewTripForm, EditTripForm, AddHarvestForm, EditHarvestForm so the
// dropdown stays consistent. Filter by trip.kind so a fishing trip shows
// fishing methods only and vice versa.
//
// v27.0b.4.5 corrections:
//   - "Archery" → "Bow" — Flavio's preferred term for the canonical method
//     list. "Archery" reads more like a sport category; "Bow" matches how
//     guides and hunters talk about it. The wallet's weapon_restriction
//     dropdown uses the same label.
//   - No "only" / "Any legal" qualifiers anywhere. The selection IS the
//     choice.
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
// saved under earlier builds (v26.3 — v27.0b.4.4) don't fail validation
// on edit. Not surfaced in any dropdown.
const LEGACY_METHODS = ['Archery', 'Spear', 'Trap', 'N/A'] as const

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

// v27.0b.4.5: normalize wallet weapon_restriction into a canonical method
// label OR null. Used in the method_display chain so the wallet wins live
// over the harvest snapshot. Returns null for "Any" / "any-legal-weapon"
// because that's a CONSTRAINT not a method — we shouldn't pre-fill the
// harvest method with "Any" just because the tag allows any weapon. Maps
// legacy lowercase values from pre-v27.0b.4.5 saves into Title Case.
export function normalizeWeaponRestriction(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  // "any" / "any legal" / "any-legal-weapon" — not a specific method
  if (lower === 'any' || lower === 'any legal' || lower === 'any-legal-weapon') {
    return null
  }
  const map: Record<string, string> = {
    archery: 'Bow',
    bow: 'Bow',
    muzzleloader: 'Muzzleloader',
    rifle: 'Rifle',
    shotgun: 'Shotgun',
    handgun: 'Handgun',
    crossbow: 'Crossbow',
  }
  return map[lower] ?? trimmed
}
