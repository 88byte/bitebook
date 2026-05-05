'use client'

// v27.5.0 — Warden Share view.
//
// Renders the trip's most recent harvest-log PDF set full-screen for a
// warden to view. Multi-pass sets render as continuous vertical scroll.
// pdfjs-dist canvas pattern copied from SignPlacementWizard.tsx.
//
// Single-set case: no picker. Multi-set case: compact pill row at top.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

type Row = {
  id: string
  pass_index: number
  pass_total: number
  signed_url: string
}

type SetSummary = {
  set_key: string
  label: string
  updated_at: string
}

type Props = {
  tripId: string
  setKey: string
  rows: Row[]
  allSets: SetSummary[]
}

type WithGlobal = {
  GlobalWorkerOptions: { workerSrc: string }
  version: string
  getDocument: (src: string) => { promise: Promise<unknown> }
}

export default function WardenView({ tripId, setKey, rows, allSets }: Props) {
  // Full-screen overlay — covers /app layout's sidebar + mobile header so
  // warden sees only the PDF + minimal chrome. position:fixed + inset:0
  // pulls us out of the document flow.
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        background: 'var(--color-paper-tint, #f5f1eb)',
      }}
    >
      <Header tripId={tripId} setKey={setKey} allSets={allSets} />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0.75rem 0.5rem 5rem',
          gap: '1rem',
        }}
      >
        {rows.map((r) => (
          <PdfRender key={r.id} url={r.signed_url} pageLabel={`${r.pass_index} of ${r.pass_total}`} />
        ))}
      </main>
      <Footer tripId={tripId} />
    </div>
  )
}

function Header({
  tripId,
  setKey,
  allSets,
}: {
  tripId: string
  setKey: string
  allSets: SetSummary[]
}) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--color-paper, #fff)',
        borderBottom: '1px solid var(--color-card-divider, rgba(0,0,0,0.08))',
        padding: '0.6rem 0.75rem calc(0.6rem + env(safe-area-inset-top, 0px)) 0.75rem',
        paddingTop: 'calc(0.6rem + env(safe-area-inset-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        flexWrap: 'wrap',
      }}
    >
      <Link
        href={`/app/trips/${tripId}`}
        className="bb-text-action"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontSize: '0.85rem',
          color: 'var(--color-ink-soft)',
        }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Done
      </Link>
      <strong
        style={{
          fontFamily: 'var(--font-barlow-condensed), sans-serif',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.95rem',
          color: 'var(--color-ink)',
        }}
      >
        Warden share
      </strong>
      {allSets.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '0.3rem',
            flexWrap: 'wrap',
            marginLeft: 'auto',
          }}
        >
          {allSets.map((s) => {
            const active = s.set_key === setKey
            return (
              <Link
                key={s.set_key}
                href={`/app/trips/${tripId}/warden?set=${encodeURIComponent(s.set_key)}`}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.55rem',
                  borderRadius: 999,
                  background: active ? 'var(--color-copper)' : 'var(--color-card-divider, rgba(0,0,0,0.08))',
                  color: active ? 'var(--color-paper, #fff)' : 'var(--color-ink-soft)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label}
              </Link>
            )
          })}
        </div>
      )}
    </header>
  )
}

function Footer({ tripId }: { tripId: string }) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        background: 'var(--color-paper, #fff)',
        borderTop: '1px solid var(--color-card-divider, rgba(0,0,0,0.08))',
        padding: 'calc(0.7rem + env(safe-area-inset-bottom, 0px)) 0.75rem 0.7rem',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Link
        href={`/app/trips/${tripId}`}
        className="bb-cta-sm"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          minWidth: '8rem',
          justifyContent: 'center',
        }}
      >
        Done
      </Link>
    </div>
  )
}

// Render a single PDF (one trip_generated_logs row) — every page rendered
// to its own canvas, vertically stacked.
function PdfRender({ url, pageLabel }: { url: string; pageLabel: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageCount, setPageCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let pdfDoc: { numPages: number; getPage: (n: number) => Promise<unknown>; destroy: () => void } | null =
      null

    async function run() {
      const container = containerRef.current
      if (!container) return
      try {
        const pdfjsLib = (await import('pdfjs-dist')) as typeof import('pdfjs-dist')
        const lib = pdfjsLib as unknown as WithGlobal
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`
        const loadingTask = lib.getDocument(url)
        pdfDoc = (await loadingTask.promise) as {
          numPages: number
          getPage: (n: number) => Promise<unknown>
          destroy: () => void
        }
        if (cancelled || !containerRef.current) return
        setPageCount(pdfDoc.numPages)
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) return
          const page = (await pdfDoc.getPage(pageNum)) as {
            getViewport: (opts: { scale: number }) => { width: number; height: number }
            render: (opts: {
              canvasContext: CanvasRenderingContext2D
              viewport: { width: number; height: number }
            }) => { promise: Promise<void> }
          }
          const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
          const targetCssWidth = Math.min(820, window.innerWidth - 16)
          const baseViewport = page.getViewport({ scale: 1 })
          const cssScale = targetCssWidth / baseViewport.width
          const renderScale = cssScale * dpr
          const viewport = page.getViewport({ scale: renderScale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`
          canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)'
          canvas.style.background = '#fff'
          canvas.style.borderRadius = '4px'
          canvas.style.marginBottom = '0.5rem'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          if (containerRef.current) containerRef.current.appendChild(canvas)
          const task = page.render({ canvasContext: ctx, viewport })
          await task.promise
        }
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Could not load PDF.')
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      cancelled = true
      if (pdfDoc) pdfDoc.destroy()
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [url])

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 820,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-ink-muted)',
          padding: '0.25rem 0',
        }}
      >
        Page {pageLabel}
        {pageCount !== null ? ` · ${pageCount} sheet${pageCount === 1 ? '' : 's'}` : ''}
      </div>
      <div ref={containerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} />
      {loading && !error && (
        <p className="bb-form-help" style={{ margin: '0.4rem 0', color: 'var(--color-ink-soft)' }}>
          Loading hunt log…
        </p>
      )}
      {error && (
        <p className="bb-form-help" role="alert" style={{ margin: '0.4rem 0', color: '#8C3C2A' }}>
          {error}
        </p>
      )}
    </div>
  )
}
