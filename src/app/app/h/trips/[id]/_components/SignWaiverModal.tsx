'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, RotateCcw, PenLine, Check } from 'lucide-react'
import SignaturePad, {
  type SignaturePadHandle,
} from '../../../../trips/[id]/log/SignaturePad'
import {
  signWaiverAction,
  fetchWaiverCheckboxMappingsAction,
  type WaiverCheckboxMapping,
} from '../../../../_lib/waiver-sign'

// v27.2.0.2 — hunter-side sign modal for waiver-style trip docs.
// Re-uses the SignaturePad canvas component from v27.2.0.1 and posts
// to signWaiverAction. Mirrors the SignModal pattern from the harvest
// log path; only the action target differs.
//
// v27.9.8c — render mandatory hunter_input.waiver_checkbox confirmations
// above the signature pad. Pad + Save gate on every checkbox being
// ticked; mappings are fetched on open via
// fetchWaiverCheckboxMappingsAction. Backward-compat: zero mappings →
// section doesn't render and the pad enables immediately as before.

export default function SignWaiverModal({
  open,
  onClose,
  actionId,
  docLabel,
  unsignedUrl,
}: {
  open: boolean
  onClose: () => void
  actionId: string
  docLabel: string
  unsignedUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const padContainerRef = useRef<HTMLDivElement>(null)
  // v27.9.8c — checkbox confirmations.
  const [checkboxes, setCheckboxes] = useState<WaiverCheckboxMapping[]>([])
  const [confirmedCheckboxes, setConfirmedCheckboxes] = useState<Record<string, boolean>>({})
  const [loadingCheckboxes, setLoadingCheckboxes] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  useEffect(() => {
    if (open) {
      setError(null)
      setIsEmpty(true)
      setConfirmedCheckboxes({})
      setLoadingCheckboxes(true)
      let cancelled = false
      fetchWaiverCheckboxMappingsAction(actionId).then((res) => {
        if (cancelled) return
        if ('error' in res) {
          // Soft-fail: surface no checkboxes rather than blocking sign.
          // Server-side validation will still gate if mappings actually exist.
          console.warn('[SignWaiverModal:fetch-checkboxes]', res.error)
          setCheckboxes([])
        } else {
          setCheckboxes(res.checkboxes)
        }
        setLoadingCheckboxes(false)
      })
      return () => {
        cancelled = true
      }
    }
  }, [open, actionId])

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

  // v27.9.8c — pad + Save gate on every checkbox being ticked.
  const allConfirmed =
    checkboxes.length === 0 ||
    checkboxes.every((c) => confirmedCheckboxes[c.field_name] === true)
  const padDisabled = !allConfirmed

  function toggleCheckbox(fieldName: string) {
    setConfirmedCheckboxes((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }))
  }

  function save() {
    setError(null)
    if (!allConfirmed) {
      setError('Confirm all required statements above.')
      return
    }
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
    const confirmedFieldNames = checkboxes
      .filter((c) => confirmedCheckboxes[c.field_name])
      .map((c) => c.field_name)
    startTransition(async () => {
      const res = await signWaiverAction(actionId, dataUrl, confirmedFieldNames)
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
      aria-label="Sign waiver"
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
            Sign and submit
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
          Drawing your signature here paints it onto <strong>{docLabel}</strong>{' '}
          and stamps any “Date Signed” fields with today’s date. The signed
          PDF saves to your trip and can be downloaded any time.
        </p>

        {unsignedUrl && (
          <a
            href={unsignedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="bb-text-action bb-text-action-copper"
            style={{ alignSelf: 'flex-start', fontSize: '0.85rem' }}
          >
            Read the waiver before signing →
          </a>
        )}

        {/* v27.9.8c — mandatory checkbox confirmations. Renders only when
            the doc has hunter_input.waiver_checkbox mappings with a
            non-empty user_label. Sig pad + Save are disabled until every
            checkbox is ticked. */}
        {checkboxes.length > 0 && (
          <div
            className="bb-tile"
            style={{
              padding: '0.75rem 0.85rem',
              borderTop: '2px solid var(--color-copper)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                flexWrap: 'wrap',
              }}
            >
              <h3
                className="bb-form-section-head"
                style={{ margin: 0, fontSize: '0.95rem' }}
              >
                Before signing, confirm:
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 999,
                  background: 'rgba(176, 108, 60, 0.12)',
                  color: 'var(--color-copper)',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Required
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {checkboxes.map((c) => {
                const checked = confirmedCheckboxes[c.field_name] === true
                return (
                  <label
                    key={c.field_name}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      minHeight: 44,
                      padding: '0.35rem 0',
                      cursor: pending ? 'default' : 'pointer',
                      color: 'var(--color-ink)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        marginTop: 2,
                        borderRadius: 4,
                        border: checked
                          ? '2px solid var(--color-copper)'
                          : '2px solid var(--color-ink-soft)',
                        background: checked ? 'rgba(176, 108, 60, 0.12)' : 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'border-color 120ms, background 120ms',
                      }}
                    >
                      {checked && (
                        <Check
                          size={14}
                          strokeWidth={3}
                          style={{ color: 'var(--color-copper)' }}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={() => toggleCheckbox(c.field_name)}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        pointerEvents: 'none',
                        width: 0,
                        height: 0,
                      }}
                    />
                    <span style={{ flex: '1 1 0', lineHeight: 1.4 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          color: 'var(--color-copper)',
                          marginRight: '0.4ch',
                          fontWeight: 700,
                        }}
                      >
                        *
                      </span>
                      {c.user_label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {loadingCheckboxes && (
          <p className="bb-form-help" style={{ margin: 0, fontStyle: 'normal' }}>
            Loading confirmations…
          </p>
        )}

        <div
          ref={padContainerRef}
          style={{
            opacity: padDisabled ? 0.5 : 1,
            pointerEvents: padDisabled ? 'none' : 'auto',
            transition: 'opacity 150ms',
          }}
          aria-disabled={padDisabled}
        >
          <SignaturePad onChange={(empty) => setIsEmpty(empty)} cssHeight={200} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={clearPad}
            disabled={pending || padDisabled}
            className="bb-text-action bb-text-action-copper"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.85rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: pending || padDisabled ? 'default' : 'pointer',
              opacity: padDisabled ? 0.5 : 1,
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
            disabled={pending || isEmpty || padDisabled}
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <PenLine size={14} aria-hidden="true" />
            {pending ? 'Signing…' : 'Save signature'}
          </button>
        </div>

        {padDisabled && !error && (
          <p className="bb-form-help" role="status" style={{ margin: 0 }}>
            Confirm all required statements above.
          </p>
        )}

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
