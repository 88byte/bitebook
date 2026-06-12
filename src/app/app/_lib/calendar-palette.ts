// v28.1.0f.1 Sprint 3.4b — calendar color palette.
//
// Two consumers:
//
// 1) Guide view legend split: outfitter-assigned vs personal/private.
// 2) Outfitter view: distinct color per guide, up to 8 guides
//    rendered with stable color assignments.
//
// Palette is drawn from the Okabe-Ito colorblind-safe set
// (https://jfly.uni-koeln.de/color/) plus two Bite Book brand tones
// so we land on eight. These hues are reliably distinguishable for
// deuteranopia, protanopia, and tritanopia.

export type CalendarSource = 'outfitter' | 'personal'

export const GUIDE_SOURCE_COLORS: Record<CalendarSource, { bg: string; fg: string; label: string }> = {
  outfitter: { bg: '#0072B2', fg: '#FFFFFF', label: 'Outfitter' },
  personal:  { bg: '#3F6B3A', fg: '#FFFFFF', label: 'Personal' },
}

// Eight-color palette for the outfitter calendar. Stable per
// (guide_profile_id) via colorForGuide(); the index is computed
// deterministically so the same guide gets the same color across
// renders.
export const ORG_GUIDE_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#0072B2', fg: '#FFFFFF' }, // blue
  { bg: '#D55E00', fg: '#FFFFFF' }, // vermillion
  { bg: '#009E73', fg: '#FFFFFF' }, // bluish green
  { bg: '#CC79A7', fg: '#FFFFFF' }, // reddish purple
  { bg: '#E69F00', fg: '#1F2419' }, // orange
  { bg: '#56B4E9', fg: '#1F2419' }, // sky blue
  { bg: '#B06C3C', fg: '#FFFFFF' }, // bb copper
  { bg: '#5B5B96', fg: '#FFFFFF' }, // indigo
] as const

/** Deterministic 32-bit FNV-1a hash on the guide id string. */
export function hashGuideId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

export function colorForGuide(guideId: string): { bg: string; fg: string } {
  const idx = hashGuideId(guideId) % ORG_GUIDE_PALETTE.length
  return ORG_GUIDE_PALETTE[idx]
}
