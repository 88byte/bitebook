'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, RotateCcw, PenLine } from 'lucide-react'
import SignaturePad, { type SignaturePadHandle } from './SignaturePad'
import { signHarvestLogPdfAction } from '../../../_lib/harvest-log-sign'

// v27.2.0.1 — sign modal for the harvest log Reports tile.
//
// Renders a centered overlay with: doc preview link + the signature
// pad + Cancel / Save Signature buttons. On Save, serializes the pad
// canvas to PNG, posts to signHarvestLogPdfAction, refreshes the
// route on success.

export default function SignModal({
  open,
  onClose,
  generatedLogId,
  fileName,
  unsignedUrl,
  alreadySigned,
  defaultSignatureDataUrl = null,
}: {
  open: boolean
  onClose: () => void
  generatedLogId: string
  fileName: string
  unsignedUrl: string
  alreadySigned: boolean
  /**
   * v27.4.0 — guide's saved default signature, base64 PNG data URL,
   * loaded on the server. When non-null, the SignaturePad pre-fills
   * with this image so the guide can Save without re-drawing. They
   * can tap "Re-draw" (the existing Clear button, repurposed) to
   * draw a fresh signature for this specific document.
   */
  defaultSignatureDataUrl?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const padContainerRef = useRef<HTMLDivElement>(null)

  // ESC closes when not pending.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  // Reset error + empty flag whenever the modal re-opens. v27.4.0 —
  // when a default signature exists, the pad starts non-empty (the
  // image is already painted), so isEmpty defaults to false in that
  // case. SignaturePad's initialDataURL effect will fire and call
  // onChange(false) once the image loads; we just match that here so
  // the Save button is enabled on first paint without a flicker.
  useEffect(() => {
    if (open) {
      setError(null)
      setIsEmpty(!defaultSignatureDataUrl)
    }
  }, [open, defaultSignatureDataUrl])

  function findPadHandle(): SignaturePadHandle | null {
    const root = padContainerRef.current
    if (!root) return null
    const canvas = root.querySelector('canvas') as
      | (HTMLCanvasElement & { __signaturePad?: SignaturePadHandle })
      | null
    return canvas?.__signaturePad ?? null
  }

  function clearPad() {
    findPadHandle()?.clear()
  }

  function save() {
    setError(null)
    const handle = findPadHandle()
    if (!handle) {
      setError('Signature pad isn’t ready yet — try once more.')
      return
    }
    if (handle.isEmpty()) {
      setError('Draw your signature first.')
      return
    }
    const dataUrl = handle.toDataURL()
    if (!dataUrl) {
      setError('Couldn’t serialize the signature.')
      return
    }
    startTransition(async () => {
      const res = await signHarvestLogPdfAction(generatedLogId, dataUrl)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign and finalize report"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(11, 8, 6, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 14,
          maxWidth: '40rem',
          width: '100%',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          padding: '1rem 1rem 1.25rem',
          boxShadow: '0 24px 48px rgba(11, 8, 6, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <h2
            className="bb-form-section-head"
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <PenLine size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
            {alreadySigned ? 'Re-sign report' : 'Sign and finalize'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-ink-soft)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="bb-form-help" style={{ margin: 0 }}>
          Drawing your signature here paints it onto the bottom-right of the
          last page of <strong>{fileName}</strong> and stamps any “Date Signed”
          fields with today’s date. The signed PDF saves alongside the
          unsigned copy — both stay available.
        </p>

        {unsignedUrl && (
          <a
            href={unsignedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="bb-text-action bb-text-action-copper"
            style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}
          >
            Open unsigned PDF in a new tab →
          </a>
        )}

        <div ref={padContainerRef}>
          <SignaturePad
            onChange={(empty) => setIsEmpty(empty)}
            cssHeight={200}
            initialDataURL={defaultSignatureDataUrl}
          />
        </div>
        {defaultSignatureDataUrl && (
          <p className="bb-form-help" style={{ margin: 0, color: 'var(--color-ink-soft)' }}>
            Pre-filled with your saved signature. Tap <strong>Clear</strong> to draw a fresh one for
            this document.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={clearPad}
            disabled={pending}
            className="bb-text-action bb-text-action-copper"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.85rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Clear
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="bb-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || isEmpty}
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <PenLine size={14} aria-hidden="true" />
            {pending ? 'Signing…' : 'Save signature'}
          </button>
        </div>

        {error && (
          <p
            className="bb-form-help"
            role="alert"
            style={{ color: '#8C3C2A', margin: 0 }}
          >
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
