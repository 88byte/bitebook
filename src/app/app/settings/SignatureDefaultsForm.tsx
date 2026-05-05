'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Trash2, RotateCcw, Check } from 'lucide-react'
import SignaturePad, { type SignaturePadHandle } from '../trips/[id]/log/SignaturePad'
import { saveDefaultSignatureAction, clearDefaultSignatureAction } from './actions'

// v27.4.0 — Signature defaults editor for /app/settings (Profile tab).
//
// Reuses the SignaturePad component the sign modals use. On mount,
// pre-fills the canvas with `initialDataURL` if the guide already has
// a saved default. Save uploads the bbox-cropped PNG to bb-private at
// signatures/{user_id}/signature.png and writes the path to
// guide_profiles.default_signature_path.
//
// Sign modals (SignModal, SignAsGuideModal) read this path at sign
// time and pre-fill their own canvas — guides accept-with-one-click
// or tap "Re-draw" to override per-event.

type Props = {
  /** Existing default signature, base64 data URL, hydrated on the server. */
  initialDataURL: string | null
  /** Whether a default is currently saved (drives the Clear button visibility). */
  hasSaved: boolean
}

export default function SignatureDefaultsForm({ initialDataURL, hasSaved }: Props) {
  const router = useRouter()
  const padContainerRef = useRef<HTMLDivElement>(null)
  const [isEmpty, setIsEmpty] = useState<boolean>(!initialDataURL)
  const [pending, startTransition] = useTransition()
  const [clearPending, startClearTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

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
    setIsEmpty(true)
    setSavedAt(null)
  }

  function save() {
    setError(null)
    setSavedAt(null)
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
      const res = await saveDefaultSignatureAction(dataUrl)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  function clearSaved() {
    setError(null)
    setSavedAt(null)
    startClearTransition(async () => {
      const res = await clearDefaultSignatureAction()
      if ('error' in res) {
        setError(res.error)
        return
      }
      // Clear local pad too, since the server cleared the saved copy.
      findPadHandle()?.clear()
      setIsEmpty(true)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <p className="bb-form-help" style={{ margin: 0 }}>
        Draw your signature once and we&rsquo;ll pre-fill it whenever you sign a harvest log
        or waiver. You can always re-draw at sign time if a particular doc needs a fresh stroke.
      </p>

      <div ref={padContainerRef}>
        <SignaturePad
          onChange={(empty) => {
            setIsEmpty(empty)
            if (savedAt !== null) setSavedAt(null)
          }}
          cssHeight={180}
          initialDataURL={initialDataURL}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={clearPad}
          disabled={pending || clearPending || isEmpty}
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
        {hasSaved && (
          <button
            type="button"
            onClick={clearSaved}
            disabled={pending || clearPending}
            className="bb-cta-sm bb-cta-sm-destructive"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Trash2 size={14} aria-hidden="true" />
            {clearPending ? 'Clearing…' : 'Clear default'}
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending || clearPending || isEmpty}
          className="bb-cta-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <PenLine size={14} aria-hidden="true" />
          {pending ? 'Saving…' : hasSaved ? 'Update default' : 'Save as default'}
        </button>
      </div>

      {savedAt !== null && !error && (
        <p
          className="bb-form-help"
          role="status"
          aria-live="polite"
          style={{ margin: 0, color: 'var(--color-copper)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Check size={14} aria-hidden="true" />
          Saved. Sign modals will pre-fill with this signature next time you sign.
        </p>
      )}
      {error && (
        <p className="bb-form-help" role="alert" style={{ margin: 0, color: '#8C3C2A' }}>
          {error}
        </p>
      )}
    </div>
  )
}
