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

const SLOT_REGEX_PREFIX = /^(?:hunter|h|row)[_-]?(\d+)[_-]?(.*)$/i
const SLOT_REGEX_SUFFIX = /^(.*?)[_-](\d+)$/i

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
  return { raw: name, slot: 0, base: name }
}
