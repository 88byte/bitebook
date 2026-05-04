'use client'

import { useEffect, useRef, useState } from 'react'

// v27.2.0.3.2 — canvas-based signature pad. Captures finger / stylus /
// mouse strokes and serializes the result as a PNG data URL.
//
// Smoothing: connect successive points with quadratic Bezier curves
// (mid-point trick) so jitter from low-res touch events doesn't read
// as a jagged line.
//
// The canvas is drawn at devicePixelRatio so retina screens get a
// crisp signature without blowing up the data URL more than ~3x.
//
// v27.2.0.3.2: bumped strokeWidth to read as real pen ink (was 2.5,
// felt thin and spotty). toDataURL now crops to the bounding box of
// drawn pixels with a small pad — the raw canvas carried huge
// transparent margins that made signatures look "centered" inside
// any composition box at sign time.

export type SignaturePadHandle = {
  isEmpty: () => boolean
  clear: () => void
  toDataURL: () => string
}

type Props = {
  /** Optional ref-style capture so the parent can call clear / toDataURL. */
  onChange?: (isEmpty: boolean) => void
  /** Width hint in CSS px. The canvas auto-grows on mount; this is just initial. */
  cssWidth?: number
  cssHeight?: number
}

// Single component because the modal owns the ref via a nested handle.
export default function SignaturePad({
  onChange,
  cssWidth = 600,
  cssHeight = 200,
}: Props & { padRef?: React.MutableRefObject<SignaturePadHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<boolean>(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const isEmptyRef = useRef<boolean>(true)
  const [, force] = useState(0)

  // Set up canvas DPR scaling once mounted.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 4.0
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0B0806'
      ctx.fillStyle = '#0B0806'
    }
  }, [])

  function pointerCoords(ev: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    const e = 'clientX' in ev ? ev : (ev as unknown as PointerEvent)
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    ev.preventDefault()
    const c = canvasRef.current
    if (!c) return
    c.setPointerCapture(ev.pointerId)
    drawingRef.current = true
    const p = pointerCoords(ev)
    lastPointRef.current = p
    const ctx = c.getContext('2d')
    if (!ctx) return
    // Dot for taps — draws a small filled circle so a single click
    // still leaves a mark. Radius scales with the line weight so taps
    // read as the same ink density as drawn strokes.
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.0, 0, Math.PI * 2)
    ctx.fill()
    isEmptyRef.current = false
    onChange?.(false)
    force((n) => n + 1)
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    ev.preventDefault()
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const last = lastPointRef.current
    const p = pointerCoords(ev)
    if (!last) {
      lastPointRef.current = p
      return
    }
    // Quadratic Bezier with mid-point as the control end — gives smooth
    // strokes without pre-buffering points.
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y)
    ctx.stroke()
    lastPointRef.current = p
  }

  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false
    lastPointRef.current = null
    const c = canvasRef.current
    if (c) {
      try {
        c.releasePointerCapture(ev.pointerId)
      } catch {
        /* already released */
      }
    }
  }

  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr)
    isEmptyRef.current = true
    lastPointRef.current = null
    onChange?.(true)
    force((n) => n + 1)
  }

  function toDataURL(): string {
    const c = canvasRef.current
    if (!c) return ''
    const ctx = c.getContext('2d')
    if (!ctx) return c.toDataURL('image/png')
    // Scan the alpha channel for the bounding box of drawn pixels.
    // The raw canvas spans the full pad (~600×200 CSS px × DPR), but a
    // typical signature only occupies a fraction of that area. Without
    // cropping, downstream PDF compositing letterboxes the full canvas
    // inside the placement box — so the visible signature appears
    // centered inside the box even when we want it left-anchored.
    const w = c.width
    const h = c.height
    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(0, 0, w, h).data
    } catch {
      // CORS-tainted canvas would throw — but we never drawImage from
      // a remote source, so this should never happen. Fall back to
      // full-canvas export rather than failing the sign.
      return c.toDataURL('image/png')
    }
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < h; y++) {
      const rowStart = y * w * 4
      for (let x = 0; x < w; x++) {
        const a = data[rowStart + x * 4 + 3]
        if (a > 0) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) {
      // Empty canvas — caller should have guarded with isEmpty(), but
      // be defensive.
      return c.toDataURL('image/png')
    }
    // Pad the bbox by a few canvas pixels so stroke caps near the
    // edge aren't visually clipped at the very edge of the PNG.
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
    const pad = Math.round(6 * dpr)
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(w - 1, maxX + pad)
    maxY = Math.min(h - 1, maxY + pad)
    const cw = maxX - minX + 1
    const ch = maxY - minY + 1
    const tmp = document.createElement('canvas')
    tmp.width = cw
    tmp.height = ch
    const tctx = tmp.getContext('2d')
    if (!tctx) return c.toDataURL('image/png')
    tctx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch)
    return tmp.toDataURL('image/png')
  }

  // Expose the pad's API on the global window via a ref-shaped object
  // attached to the canvas's dataset. Simpler: use forwardRef-ish
  // pattern — but we don't need refs across components since the
  // SignModal calls the helpers via children prop. Provide imperative
  // access by attaching helpers to the canvas element:
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    // @ts-expect-error attach helpers on the DOM node for the modal to read
    c.__signaturePad = {
      isEmpty: () => isEmptyRef.current,
      clear,
      toDataURL,
    } satisfies SignaturePadHandle
  }, [])

  return (
    <div
      style={{
        border: '1px solid var(--color-ink-tint)',
        borderRadius: 12,
        background: '#FFFFFF',
        padding: 8,
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: cssWidth,
          height: cssHeight,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
      {/* Baseline guide so signers know where to align */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 28,
          borderTop: '1px dashed var(--color-ink-tint)',
          pointerEvents: 'none',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 20,
          bottom: 12,
          fontSize: '0.75rem',
          color: 'var(--color-ink-muted)',
          pointerEvents: 'none',
        }}
      >
        Sign above the line
      </span>
    </div>
  )
}
