'use client'

import { useState, useTransition } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { generateTripInviteLinkAction } from '../../hunters/actions'

// v27.9.1 — trip-scoped share link UI. Renders inside HuntersOnTripPanel's
// Manage block. Single "Get share link" CTA on first render; on click,
// generates a tokenized invitations row tied to this trip and reveals the
// URL with a Copy button. Multi-use, expires on the trip's start_date.
//
// Surgical: standalone client component, props limited to tripId +
// tripTitle. HuntersOnTripPanel only changes by rendering this component
// in one place.
export default function TripShareLinkButton({
  tripId,
  tripTitle,
}: {
  tripId: string
  tripTitle: string
}) {
  const [pending, startTransition] = useTransition()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function generate() {
    setError(null)
    startTransition(async () => {
      const r = await generateTripInviteLinkAction(tripId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setShareUrl(r.invite_url)
    })
  }

  async function copy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {}
    }
  }

  return (
    <div
      style={{
        marginTop: '0.85rem',
        paddingTop: '0.85rem',
        borderTop: '1px dashed var(--color-card-divider, rgba(0,0,0,0.12))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
      }}
    >
      <span className="bb-form-label">Share this trip with hunters</span>
      <p className="bb-form-help" style={{ margin: 0 }}>
        Hunters who accept this link join Bite Book AND get added to{' '}
        <strong>{tripTitle}</strong>. Share with as many as you want. Link
        expires on the trip start date.
      </p>

      {!shareUrl && (
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="bb-cta-sm"
          style={{ alignSelf: 'flex-start' }}
        >
          <Link2 size={14} aria-hidden="true" />
          {pending ? 'Generating…' : 'Get trip share link'}
        </button>
      )}

      {shareUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="bb-input"
            aria-label="Trip share link"
            onFocus={(e) => e.currentTarget.select()}
            style={{ flex: '1 1 220px', minWidth: 0 }}
          />
          <button
            type="button"
            onClick={copy}
            className="bb-cta-sm"
            style={{ flexShrink: 0 }}
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {error && (
        <p className="bb-form-help" role="alert" style={{ margin: 0, color: '#8C3C2A' }}>
          {error}
        </p>
      )}
    </div>
  )
}
