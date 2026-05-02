// v27.1.1.0.3b — public types + slot-detection helper for the fill engine.
// Lives in a non-'use server' module because Next.js requires every export
// from a 'use server' file to be an async server action. Types and pure
// helpers don't satisfy that, so they live here.

export type FilledPdfArtifact = {
  doc_id: string
  file_path: string
  signed_url: string
  label: string
  /** 1-indexed page in the multi-PDF overflow series. */
  index: number
  total: number
}

export type GenerateFilledLogResult =
  | { ok: true; artifacts: FilledPdfArtifact[]; warnings: string[] }
  | { error: string }

export type ParsedFieldName = {
  raw: string
  slot: number  // 0 = trip-level, 1+ = per-hunter slot
  base: string  // logical name without slot decoration
}

// v27.1.1.0.3c.4: loosened to catch more state-form naming variants.
// Prefix: hunter | h | row optionally followed by space/underscore/hyphen,
// then a digit run, then optional separator + rest.
//   matches: hunter1, hunter_1, hunter 1, h1, h-1, row1, hunter1_name, etc.
// Suffix: rest, then space/underscore/hyphen + digit run.
//   matches: name_2, name 2, name-2.
// Suffix-parens: rest, then "(N)" or " (N)".
//   matches: NAME(2), NAME (2).
// Bare-trailing: rest + digit run with no separator at all.
//   matches: NAME2, ADDRESS3 — disambiguated below so we don't wrongly
//   slot a single field whose base ends in a digit (e.g. "STREET2" the
//   second-line address field). We require the base to lack a digit
//   immediately before, so "ADDRESS2" matches but "STREET2" only when
//   sibling slots also exist (handled by detectImplicitSlot1).
const SLOT_REGEX_PREFIX = /^(?:hunter|h|row)[\s_-]?(\d+)[\s_-]?(.*)$/i
const SLOT_REGEX_SUFFIX = /^(.*?)[\s_-](\d+)$/i
const SLOT_REGEX_PARENS = /^(.*?)\s*\((\d+)\)$/

export function parseFieldName(name: string): ParsedFieldName {
  const prefix = SLOT_REGEX_PREFIX.exec(name)
  if (prefix) {
    const slot = Number(prefix[1])
    if (Number.isFinite(slot) && slot >= 1 && slot <= 99) {
      return { raw: name, slot, base: (prefix[2] || '').trim() }
    }
  }
  const suffix = SLOT_REGEX_SUFFIX.exec(name)
  if (suffix) {
    const slot = Number(suffix[2])
    if (Number.isFinite(slot) && slot >= 1 && slot <= 99) {
      return { raw: name, slot, base: (suffix[1] || '').trim() }
    }
  }
  const parens = SLOT_REGEX_PARENS.exec(name)
  if (parens) {
    const slot = Number(parens[2])
    if (Number.isFinite(slot) && slot >= 1 && slot <= 99) {
      return { raw: name, slot, base: (parens[1] || '').trim() }
    }
  }
  return { raw: name, slot: 0, base: name }
}

// v27.1.1.0.3c.4: implicit slot-1 derivation. Many state forms (e.g. CDFW
// 992-A) name Hunter 1 fields without any slot suffix and only suffix
// Hunter 2..N as `_2`, `_3`, etc. — so `FULL NAME` (Hunter 1) and
// `FULL NAME_2` (Hunter 2) live side by side.
//
// parseFieldName alone returns slot=0 for the bare names, dragging Hunter
// 1 fields into the trip-level filter. This helper takes the FULL field
// list as context and returns a Set<fieldName> of names that should be
// treated as implicit slot 1 — namely, any base-without-suffix name whose
// `<base>_<N>` (N>=2) sibling exists in the same form.
//
// The wizard hydrates `slotOverrides` from this set on first load so the
// save layer writes hunter_slot=1 explicitly. Guides can still re-pin via
// the slot badge if the heuristic is wrong for their PDF.
export function detectImplicitSlot1(fieldNames: string[]): Set<string> {
  const out = new Set<string>()
  // Index every field by base name and slot.
  const bySlot = new Map<string, Map<number, string>>()  // base -> (slot -> raw name)
  for (const raw of fieldNames) {
    const parsed = parseFieldName(raw)
    if (!bySlot.has(parsed.base)) bySlot.set(parsed.base, new Map())
    const m = bySlot.get(parsed.base)!
    if (!m.has(parsed.slot)) m.set(parsed.slot, raw)
  }
  // For each bare/slot-0 field, mark implicit-1 if its base also has a
  // slot >= 2 sibling. (Don't promote to slot 1 unless we see at least a
  // slot 2 — otherwise unrelated trip-level fields like "BUSINESS NAME"
  // would get pinned.)
  for (const raw of fieldNames) {
    const parsed = parseFieldName(raw)
    if (parsed.slot !== 0) continue
    const m = bySlot.get(parsed.base)
    if (!m) continue
    let hasSibling = false
    for (const slot of m.keys()) {
      if (slot >= 2) { hasSibling = true; break }
    }
    if (hasSibling) out.add(raw)
  }
  return out
}
