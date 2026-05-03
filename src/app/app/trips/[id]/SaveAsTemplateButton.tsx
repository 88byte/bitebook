'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { BookmarkPlus, CheckCircle2 } from 'lucide-react'
import { saveTripAsTemplateAction } from '../../_lib/trip-template-actions'

// v27.1.4 — Save as template button. Lives on the trip detail action row.
// Opens a small modal with a label input (default = trip title), submits
// to saveTripAsTemplateAction, shows a success toast on the action row
// after close. Modal mirrors ConfirmModal's portal + focus-trap pattern;
// we don't use ConfirmModal directly because we need a free-form input as
// the primary control rather than a typeToConfirm guard.
export default function SaveAsTemplateButton({
  tripId,
  defaultLabel,
}: {
  tripId: string
  defaultLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(defaultLabel)
  const [error, setError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Reset label to default each open so a re-open reflects the latest title.
  useEffect(() => {
    if (open) {
      setLabel(defaultLabel)
      setError(null)
      // Defer focus a frame so portal mounts.
      const t = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [open, defaultLabel])

  // Esc + focus trap mirror ConfirmModal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!pending) setOpen(false)
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending])

  // Auto-dismiss the success toast after a moment.
  useEffect(() => {
    if (!savedToast) return
    const t = setTimeout(() => setSavedToast(false), 4000)
    return () => clearTimeout(t)
  }, [savedToast])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setError('Template name is required.')
      return
    }
    startTransition(async () => {
      const res = await saveTripAsTemplateAction(tripId, trimmed)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setOpen(false)
      setSavedToast(true)
      router.refresh()
    })
  }

  function onBackdropClick() {
    if (!pending) setOpen(false)
  }

  const portal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="bb-modal-backdrop"
            onClick={onBackdropClick}
            role="presentation"
          >
            <div
              ref={cardRef}
              className="bb-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id={titleId} className="bb-modal-title">Save trip as template</h2>
              <div className="bb-modal-body">
                <p style={{ marginBottom: '0.75rem' }}>
                  Saves activity, location, hunt details, and any waivers or resources
                  attached to this trip. Hunters and harvest logs aren&rsquo;t copied.
                </p>
                <form onSubmit={onSubmit}>
                  <label
                    className="bb-form-label"
                    htmlFor={`${titleId}-label`}
                    style={{ display: 'block', marginBottom: '0.35rem' }}
                  >
                    Template name
                  </label>
                  <input
                    ref={inputRef}
                    id={`${titleId}-label`}
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="bb-input"
                    maxLength={120}
                    disabled={pending}
                    autoComplete="off"
                  />
                  {error && (
                    <p
                      role="alert"
                      style={{ color: '#8C3C2A', fontSize: '0.85rem', marginTop: '0.5rem' }}
                    >
                      {error}
                    </p>
                  )}
                  <div className="bb-modal-actions" style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      disabled={pending}
                      className="bb-btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending || !label.trim()}
                      className="bb-cta-sm"
                    >
                      {pending ? 'Saving...' : 'Save template'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        type="button"
        className="bb-btn-secondary"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <BookmarkPlus size={14} aria-hidden="true" />
        Save as template
      </button>
      {savedToast && (
        <span
          role="status"
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.85rem',
            color: '#3F6B3A',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          Template saved
        </span>
      )}
      {portal}
    </>
  )
}
