'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bookmark, FileText, X } from 'lucide-react'
import type { TripTemplateSummary } from '../../_lib/trip-template-queries'

// v27.1.4 — "Use template" picker on /app/trips/new. Opens a modal listing
// every active trip_template the guide owns. Tapping a row navigates to
// /app/trips/new?template=<id>, which the page then resolves and pre-fills
// the form with. Hidden by the parent when templates.length === 0.
//
// We use Link (with onClick to close the modal) rather than router.push so
// the navigation goes through Next's standard prefetch path — cleaner than
// imperatively pushing.
export default function UseTemplateButton({
  templates,
  activeTemplateId,
}: {
  templates: TripTemplateSummary[]
  activeTemplateId: string | null
}) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const portal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="bb-modal-backdrop"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              ref={cardRef}
              className="bb-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '32rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <h2 id={titleId} className="bb-modal-title">Use a template</h2>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="bb-text-action"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="bb-modal-body" style={{ marginTop: '0.5rem' }}>
                <p style={{ marginBottom: '0.75rem', color: 'var(--color-ink-soft)', fontSize: '0.9rem' }}>
                  Pick a saved template to pre-fill activity, location, hunt details, and any
                  attached docs. You can still tweak each field before saving the trip.
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    maxHeight: '50vh',
                    overflowY: 'auto',
                  }}
                >
                  {templates.map((t) => {
                    const isActive = activeTemplateId === t.id
                    const subParts: string[] = []
                    if (t.activity) {
                      subParts.push(t.activity === 'fishing' ? 'Fishing' : 'Hunting')
                    }
                    if (t.state) subParts.push(t.state)
                    if (t.city) subParts.push(t.city)
                    return (
                      <Link
                        key={t.id}
                        href={`/app/trips/new?template=${t.id}`}
                        onClick={() => setOpen(false)}
                        className="bb-tile"
                        style={{
                          textDecoration: 'none',
                          color: 'inherit',
                          padding: '0.75rem 0.875rem',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.6rem',
                          borderColor: isActive ? 'var(--color-copper)' : undefined,
                          background: isActive ? 'rgba(168, 92, 50, 0.06)' : undefined,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            width: 32,
                            height: 32,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            backgroundColor: 'var(--color-paper-tint)',
                            color: 'var(--color-ink-soft)',
                          }}
                        >
                          <Bookmark size={16} />
                        </span>
                        <div style={{ flex: '1 1 0', minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: 'var(--color-ink)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                            }}
                          >
                            {t.label}
                          </div>
                          <div
                            style={{
                              fontSize: '0.82rem',
                              color: 'var(--color-ink-soft)',
                              marginTop: '0.1rem',
                            }}
                          >
                            {subParts.length > 0 ? subParts.join(' · ') : 'No location set'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--color-ink-soft)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              marginTop: '0.1rem',
                            }}
                          >
                            <FileText size={11} aria-hidden="true" />
                            {t.doc_count} {t.doc_count === 1 ? 'doc' : 'docs'}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
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
        onClick={() => setOpen(true)}
        className="bb-btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Bookmark size={14} aria-hidden="true" />
        Use template
      </button>
      {portal}
    </>
  )
}
