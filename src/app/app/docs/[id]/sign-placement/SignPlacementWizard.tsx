'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  Save,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { savePlacementsAction } from './actions'

// v27.2.0.3 — drag/resize signature placement wizard.
//
// Renders one PDF page at a time on a canvas via pdfjs-dist. Boxes are
// absolutely-positioned divs over the canvas with two interaction
// surfaces:
//   - whole-box pointer-down + drag → move
//   - bottom-right corner handle pointer-down + drag → resize
//
// Coordinates are stored as fractions of the page in CANVAS coordinate
// space (origin top-left). The signing engine converts to PDF points
// (origin bottom-left) at sign time.
//
// pdfjs-dist worker: pinned to the unpkg CDN at the matching version
// so we don't have to ship the worker as a static asset. Network is
// already required for the PDF fetch, so this is no extra dependency.

const BOX_DEFAULT_FRAC_W = 0.28 // ~28% of page width
const BOX_DEFAULT_FRAC_H = 0.06 // ~6% of page height
const MIN_FRAC_W = 0.04
const MIN_FRAC_H = 0.02

type Role = 'hunter' | 'guide'
type Placement = {
  role: Role
  page: number
  x: number // fraction 0..1 in canvas coord space
  y: number
  w: number
  h: number
}

type DragMode =
  | { kind: 'move'; index: number; offsetX: number; offsetY: number }
  | { kind: 'resize'; index: number; startW: number; startH: number; startPx: number; startPy: number }
  | null

type Props = {
  docId: string
  pdfUrl: string
  initialPlacements: Placement[]
}

// v27.2.0.3.3: dropped the `kind` prop — both signer roles
// (hunter + guide) are pickable on BOTH waiver and harvest_log
// kinds, and the help copy is identical. Kind-aware copy lives in
// the route page (sign-placement/page.tsx) header.
export default function SignPlacementWizard({ docId, pdfUrl, initialPlacements }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<unknown>(null) // pdfjs PDFDocumentProxy

  const [pageNum, setPageNum] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(0)
  const [pageDim, setPageDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [loading, setLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [placements, setPlacements] = useState<Placement[]>(initialPlacements)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [savePending, startSave] = useTransition()
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const router = useRouter()

  // Load pdfjs-dist on mount (client only) and parse the PDF once.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const pdfjsLib = (await import('pdfjs-dist')) as typeof import('pdfjs-dist')
        // Worker URL points at the unpkg-hosted ESM build matching the
        // installed package version. `version` is exposed on the lib.
        // No bundler config required.
        type WithGlobal = { GlobalWorkerOptions: { workerSrc: string }; version: string; getDocument: (src: string) => { promise: Promise<unknown> } }
        const lib = pdfjsLib as unknown as WithGlobal
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`
        const loadingTask = lib.getDocument(pdfUrl)
        const pdfDoc = await loadingTask.promise as { numPages: number; getPage: (n: number) => Promise<unknown>; destroy: () => void }
        if (cancelled) {
          pdfDoc.destroy()
          return
        }
        pdfDocRef.current = pdfDoc
        setTotalPages(pdfDoc.numPages)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load PDF.')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
      const d = pdfDocRef.current as { destroy?: () => void } | null
      d?.destroy?.()
    }
  }, [pdfUrl])

  // Render the current page on the canvas whenever pageNum changes (and
  // the doc is loaded).
  useEffect(() => {
    if (loading || !pdfDocRef.current) return
    let cancelled = false
    async function render() {
      const pdfDoc = pdfDocRef.current as { getPage: (n: number) => Promise<unknown> }
      const page = (await pdfDoc.getPage(pageNum)) as {
        getViewport: (opts: { scale: number }) => { width: number; height: number }
        render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
      }
      // v27.2.0.3 MVP: fit the page to a max width of 720 CSS px so the
      // canvas stays readable on phones. Devicepixelratio scales the
      // backing store for crispness.
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
      const targetCssWidth = Math.min(720, window.innerWidth - 32)
      const baseViewport = page.getViewport({ scale: 1 })
      const cssScale = targetCssWidth / baseViewport.width
      const renderScale = cssScale * dpr
      const viewport = page.getViewport({ scale: renderScale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      canvas.style.width = `${Math.round(viewport.width / dpr)}px`
      canvas.style.height = `${Math.round(viewport.height / dpr)}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const task = page.render({ canvasContext: ctx, viewport })
      await task.promise
      if (cancelled) return
      setPageDim({ w: viewport.width / dpr, h: viewport.height / dpr })
    }
    render().catch((e) => {
      if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not render page.')
    })
    return () => { cancelled = true }
  }, [loading, pageNum])

  // Filter placements to the current page; the others stay in state but
  // aren't rendered on this page.
  const visiblePlacements = placements
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.page === pageNum)

  function addBox(role: Role) {
    const fracX = 0.5 - BOX_DEFAULT_FRAC_W / 2
    const fracY = 0.7 - BOX_DEFAULT_FRAC_H / 2 // lower-middle by default
    setPlacements((prev) => [
      ...prev,
      { role, page: pageNum, x: fracX, y: fracY, w: BOX_DEFAULT_FRAC_W, h: BOX_DEFAULT_FRAC_H },
    ])
  }

  function removeBox(index: number) {
    setPlacements((prev) => prev.filter((_, i) => i !== index))
  }

  function onBoxPointerDown(ev: React.PointerEvent<HTMLDivElement>, index: number) {
    ev.preventDefault()
    ev.stopPropagation()
    const target = ev.currentTarget
    target.setPointerCapture(ev.pointerId)
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const fracX = (ev.clientX - rect.left) / rect.width
    const fracY = (ev.clientY - rect.top) / rect.height
    const p = placements[index]
    setDragMode({
      kind: 'move',
      index,
      offsetX: fracX - p.x,
      offsetY: fracY - p.y,
    })
  }

  function onResizePointerDown(ev: React.PointerEvent<HTMLDivElement>, index: number) {
    ev.preventDefault()
    ev.stopPropagation()
    const target = ev.currentTarget
    target.setPointerCapture(ev.pointerId)
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const fracX = (ev.clientX - rect.left) / rect.width
    const fracY = (ev.clientY - rect.top) / rect.height
    const p = placements[index]
    setDragMode({
      kind: 'resize',
      index,
      startW: p.w,
      startH: p.h,
      startPx: fracX,
      startPy: fracY,
    })
  }

  function onPointerMove(ev: React.PointerEvent<HTMLDivElement>) {
    if (!dragMode) return
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const fracX = (ev.clientX - rect.left) / rect.width
    const fracY = (ev.clientY - rect.top) / rect.height
    setPlacements((prev) => {
      const next = [...prev]
      const i = dragMode.index
      const p = next[i]
      if (!p) return prev
      if (dragMode.kind === 'move') {
        next[i] = {
          ...p,
          x: Math.min(1 - p.w, Math.max(0, fracX - dragMode.offsetX)),
          y: Math.min(1 - p.h, Math.max(0, fracY - dragMode.offsetY)),
        }
      } else {
        const dx = fracX - dragMode.startPx
        const dy = fracY - dragMode.startPy
        const newW = Math.max(MIN_FRAC_W, Math.min(1 - p.x, dragMode.startW + dx))
        const newH = Math.max(MIN_FRAC_H, Math.min(1 - p.y, dragMode.startH + dy))
        next[i] = { ...p, w: newW, h: newH }
      }
      return next
    })
  }

  function onPointerUp() {
    setDragMode(null)
  }

  function save() {
    setSaveMsg(null)
    startSave(async () => {
      const res = await savePlacementsAction(docId, placements)
      if ('error' in res) {
        setSaveMsg(`Couldn’t save: ${res.error}`)
        return
      }
      setSaveMsg(`Saved ${res.count} placement${res.count === 1 ? '' : 's'}.`)
      router.refresh()
    })
  }

  return (
    <div className="bb-form-narrow mt-4 flex flex-col gap-3">
      {/* v27.3.10 item 5: action row stripped of bb-tile wrapper —
          renders flush on the page. All three buttons are white
          (bb-btn-secondary). Divider sits underneath the row. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => addBox('hunter')}
            disabled={loading}
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Add hunter signature
          </button>
          <button
            type="button"
            onClick={() => addBox('guide')}
            disabled={loading}
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Add guide signature
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={save}
            disabled={loading || savePending}
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Save size={14} aria-hidden="true" />
            {savePending ? 'Saving…' : 'Save placements'}
          </button>
        </div>
        {saveMsg && (
          <p className="bb-form-help" role="status" style={{ marginTop: '0.5rem' }}>
            {saveMsg}
          </p>
        )}
        <div className="bb-page-divider mt-3" aria-hidden="true" />
      </div>

      <section className="bb-tile" style={{ padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={loading || pageNum <= 1}
            onClick={() => setPageNum((n) => Math.max(1, n - 1))}
            className="bb-btn-secondary"
            aria-label="Previous page"
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
            Page {pageNum} of {totalPages || '—'}
          </span>
          <button
            type="button"
            disabled={loading || pageNum >= totalPages}
            onClick={() => setPageNum((n) => Math.min(totalPages, n + 1))}
            className="bb-btn-secondary"
            aria-label="Next page"
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
            {visiblePlacements.length} on this page · {placements.length} total
          </span>
        </div>
      </section>

      <section
        className="bb-tile"
        style={{
          padding: '0.5rem',
          background: '#F4F0E8',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {loading && (
          <div style={{ padding: '3rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-ink-soft)' }}>
            <Loader2 size={16} className="bb-spin" aria-hidden="true" />
            Loading PDF…
          </div>
        )}
        {loadError && (
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', padding: '1rem' }}>
            {loadError}
          </p>
        )}
        {!loading && !loadError && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            {/* Drag overlay covers the canvas exactly. Boxes are
                children of this overlay so onPointerMove fires while
                pointer is inside the canvas region. */}
            <div
              ref={overlayRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: 'absolute',
                inset: 0,
                touchAction: 'none',
              }}
            >
              {visiblePlacements.map(({ p, i }) => (
                <div
                  key={i}
                  onPointerDown={(e) => onBoxPointerDown(e, i)}
                  style={{
                    position: 'absolute',
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    width: `${p.w * 100}%`,
                    height: `${p.h * 100}%`,
                    border: `2px solid ${p.role === 'hunter' ? '#B06C3C' : '#2E5E2E'}`,
                    background: p.role === 'hunter' ? 'rgba(176, 108, 60, 0.15)' : 'rgba(46, 94, 46, 0.15)',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                    cursor: 'move',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: p.role === 'hunter' ? '#8C3C2A' : '#2E5E2E',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '2px 4px',
                    userSelect: 'none',
                  }}
                >
                  <span>{p.role}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeBox(i)
                    }}
                    aria-label={`Remove ${p.role} signature box`}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                  {/* Resize handle — bottom-right corner */}
                  <div
                    onPointerDown={(e) => onResizePointerDown(e, i)}
                    style={{
                      position: 'absolute',
                      right: -1,
                      bottom: -1,
                      width: 14,
                      height: 14,
                      background: p.role === 'hunter' ? '#B06C3C' : '#2E5E2E',
                      cursor: 'nwse-resize',
                      borderRadius: '0 0 4px 0',
                    }}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="bb-form-help" style={{ margin: 0 }}>
        Hunter sigs are copper, guide sigs are forest green. Drag the box to
        move; drag the corner to resize. Coordinates persist as fractions
        of the page so the layout stays correct at any zoom.
      </p>
      {/* Suppress unused dimension state warning — pageDim is captured
          for future thumbnail rendering / coordinate debugging in
          v27.2.0.4. */}
      <span style={{ display: 'none' }}>{pageDim.w}×{pageDim.h}</span>
    </div>
  )
}
