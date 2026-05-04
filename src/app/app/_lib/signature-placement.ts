// v27.2.0.3 — shared signature placement resolver. Both waiver-sign.ts
// and harvest-log-sign.ts use this helper to compute where a signer's
// image should land on a PDF.
//
// Precedence (highest first):
//   1. Mapping-driven. Any doc_field_mappings row whose data_source_path
//      matches `e_signature.{role}` resolves to the AcroForm widget's
//      rectangle, read from pdf-lib via field.acroField.getWidgets()[0].
//      The widget's owning page is found by walking each page's
//      Annotations array for a ref match.
//   2. Drag-place fallback. Rows with mapping_kind='signature',
//      signature_role={role}, and placement_coords jsonb. The wizard
//      saves coords as fractions [0..1] in CANVAS coord space (top-
//      left origin); we convert to PDF points (bottom-left origin)
//      here.
//   3. Default placement. Last-page bottom-right, ~68mm × 22mm.
//
// Returns an array of resolved rects in PDF points + page index, ready
// for page.drawImage(). Empty array means caller should use default
// placement.

import { PDFDocument, PDFName, PDFRef } from 'pdf-lib'

export type SignerRole = 'hunter' | 'guide'

export type ResolvedPlacement = {
  pageIndex: number // 0-indexed
  x: number // PDF points, bottom-left origin
  y: number
  w: number
  h: number
  source: 'mapping' | 'drag-place' | 'default'
}

export type MappingRow = {
  field_name: string
  data_source_path: string | null
  mapping_kind: string | null
  signature_role: string | null
  placement_coords: unknown
}

type FractionCoords = {
  page?: number // 1-indexed in the wizard's storage; we normalize below
  x?: number
  y?: number
  w?: number
  h?: number
}

const MM_TO_PT = 2.8346
const DEFAULT_W_MM = 68
const DEFAULT_H_MM = 22
const DEFAULT_MARGIN_RIGHT_MM = 10
const DEFAULT_MARGIN_BOTTOM_MM = 30

export function defaultPlacement(pdf: PDFDocument): ResolvedPlacement | null {
  const pages = pdf.getPages()
  if (pages.length === 0) return null
  const lastIndex = pages.length - 1
  const page = pages[lastIndex]
  const { width: pw, height: ph } = page.getSize()
  void ph
  const w = DEFAULT_W_MM * MM_TO_PT
  const h = DEFAULT_H_MM * MM_TO_PT
  return {
    pageIndex: lastIndex,
    x: pw - w - DEFAULT_MARGIN_RIGHT_MM * MM_TO_PT,
    y: DEFAULT_MARGIN_BOTTOM_MM * MM_TO_PT,
    w,
    h,
    source: 'default',
  }
}

// Walks the loaded PDF's pages to find the page index hosting a given
// widget. pdf-lib doesn't expose a public widget→page helper, so we
// compare each page's Annots array entries (which are PDFRefs) to the
// widget's own ref.
function findPageIndexForWidget(
  pdf: PDFDocument,
  widgetRef: PDFRef
): number | null {
  const pages = pdf.getPages()
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.Annots()
    if (!annots) continue
    try {
      const arr = (annots as unknown as { asArray: () => unknown[] }).asArray()
      for (const ref of arr) {
        if ((ref as PDFRef) === widgetRef) return i
      }
    } catch {
      /* malformed Annots — skip */
    }
  }
  return null
}

export function resolvePlacements(
  pdf: PDFDocument,
  mappings: MappingRow[],
  role: SignerRole
): ResolvedPlacement[] {
  const out: ResolvedPlacement[] = []
  const pages = pdf.getPages()

  // ── Pass 1: mapping-driven (AcroForm widget rect) ─────────────────────
  const sentinel = `e_signature.${role}`
  let form: ReturnType<typeof pdf.getForm> | null = null
  try { form = pdf.getForm() } catch { form = null }
  if (form) {
    for (const m of mappings) {
      if (m.data_source_path !== sentinel) continue
      try {
        const field = form.getField(m.field_name)
        // pdf-lib exposes acroField on the typed wrapper; widgets carry
        // the rect we need.
        const acro = (field as unknown as { acroField: { getWidgets: () => Array<{ ref: PDFRef; dict: { get: (k: PDFName) => unknown }; getRectangle: () => { x: number; y: number; width: number; height: number } }> } }).acroField
        const widgets = acro.getWidgets()
        if (!widgets || widgets.length === 0) continue
        for (const widget of widgets) {
          let pageIndex: number | null = null
          // Try the widget's P entry first — fastest.
          try {
            const pRef = widget.dict.get(PDFName.of('P'))
            if (pRef) {
              const idx = pages.findIndex((p) => p.ref === (pRef as unknown as PDFRef))
              if (idx >= 0) pageIndex = idx
            }
          } catch { /* fall through */ }
          if (pageIndex === null) {
            pageIndex = findPageIndexForWidget(pdf, widget.ref)
          }
          if (pageIndex === null) continue
          const rect = widget.getRectangle()
          out.push({
            pageIndex,
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
            source: 'mapping',
          })
        }
      } catch {
        // Field may not exist in a replaced PDF; skip.
      }
    }
  }

  // ── Pass 2: drag-place fallback (placement_coords fractions) ──────────
  // Only fires when no mapping-driven placements landed for this role —
  // mapping is authoritative when present.
  if (out.length === 0) {
    for (const m of mappings) {
      if (m.mapping_kind !== 'signature') continue
      if (m.signature_role !== role) continue
      const c = m.placement_coords as FractionCoords | null
      if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue
      // Wizard stores page as 1-indexed; coords as fractions [0..1] in
      // CANVAS space (origin top-left). Convert to 0-indexed page +
      // PDF points (origin bottom-left).
      const pageIdx0 = Math.max(0, Math.min((c.page ?? 1) - 1, pages.length - 1))
      const page = pages[pageIdx0]
      const { width: pw, height: ph } = page.getSize()
      const w = (c.w ?? 0.28) * pw
      const h = (c.h ?? 0.06) * ph
      const x = c.x * pw
      const y = ph - c.y * ph - h // flip Y from canvas to PDF
      out.push({ pageIndex: pageIdx0, x, y, w, h, source: 'drag-place' })
    }
  }

  // ── Pass 3: default ───────────────────────────────────────────────────
  if (out.length === 0) {
    const def = defaultPlacement(pdf)
    if (def) out.push(def)
  }

  return out
}
