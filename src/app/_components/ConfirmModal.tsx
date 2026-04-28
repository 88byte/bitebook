'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// v25.9: branded replacement for window.confirm. Renders into a portal so it
// escapes any clipped container, traps focus on Cancel (safer default than
// auto-focusing a destructive Confirm), supports a typeToConfirm guard for
// extra-dangerous actions, and exposes pending state so the parent action's
// in-flight period can disable the buttons.
//
// Usage: open/close state lives in the parent. Parent invokes its server
// action inside onConfirm, then closes the modal in the .then/.finally.
export type ConfirmModalProps = {
  open: boolean
  title: string
  body: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  typeToConfirm?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  isPending?: boolean
}

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  typeToConfirm,
  onConfirm,
  onCancel,
  isPending = false,
}: ConfirmModalProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [typed, setTyped] = useState('')

  // Reset the type-to-confirm input every time the modal opens.
  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  // Auto-focus Cancel and trap focus inside the card while open. Esc closes.
  useEffect(() => {
    if (!open) return

    // Defer focus to next frame so the portal has mounted.
    const focusTimer = setTimeout(() => cancelRef.current?.focus(), 0)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!isPending) onCancel()
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        // Simple focus trap — keep tabbing inside the card.
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
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, isPending, onCancel])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const typeMatchOk = !typeToConfirm
    ? true
    : typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase()

  const confirmDisabled = isPending || !typeMatchOk

  function onBackdropClick() {
    if (!isPending) onCancel()
  }

  return createPortal(
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
        <h2 id={titleId} className="bb-modal-title">{title}</h2>
        <div className="bb-modal-body">{body}</div>

        {typeToConfirm && (
          <div style={{ marginTop: '0.75rem' }}>
            <label
              htmlFor={`${titleId}-type`}
              style={{
                display: 'block',
                fontSize: '0.78rem',
                color: 'var(--color-ink-muted)',
                marginBottom: '0.35rem',
              }}
            >
              Type <strong>{typeToConfirm}</strong> to confirm.
            </label>
            <input
              id={`${titleId}-type`}
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="bb-input"
              disabled={isPending}
            />
          </div>
        )}

        <div className="bb-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="bb-btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={confirmDisabled}
            className={destructive ? 'bb-cta-sm bb-cta-sm-destructive' : 'bb-cta-sm'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
