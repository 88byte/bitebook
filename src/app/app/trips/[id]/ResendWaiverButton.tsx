'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Send } from 'lucide-react'
import { resendWaiverAction } from '../../_lib/waiver-sign'

// v27.9.8a.1.1 — Resend a waiver-sign reminder to a hunter. Mirrors
// the v25.5 ResendInviteButton cooldown pattern: 5-minute cooldown
// shared with the server, live "M:SS" countdown, "Last resent X min
// ago" caption when ready, and a transient "Sent" pill on success.
const COOLDOWN_MS = 5 * 60 * 1000

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
function formatRelative(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`
  const d = Math.floor(hr / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

export default function ResendWaiverButton({
  actionId,
  lastSentAt,
  hunterName,
  waiverLabel,
}: {
  actionId: string
  lastSentAt: string | null
  hunterName: string
  waiverLabel: string
}) {
  const [lastSentMs, setLastSentMs] = useState<number | null>(() =>
    lastSentAt ? new Date(lastSentAt).getTime() : null
  )
  const [now, setNow] = useState<number>(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [showSentPill, setShowSentPill] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setLastSentMs(lastSentAt ? new Date(lastSentAt).getTime() : null)
  }, [lastSentAt])

  useEffect(() => {
    if (!showSentPill) return
    const id = setTimeout(() => setShowSentPill(false), 4000)
    return () => clearTimeout(id)
  }, [showSentPill])

  const cooldownUntilMs = lastSentMs !== null ? lastSentMs + COOLDOWN_MS : 0
  const remainingMs = cooldownUntilMs - now
  const inCooldown = lastSentMs !== null && remainingMs > 0

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await resendWaiverAction(actionId)
      if ('error' in res) {
        if (res.error === 'cooldown' && res.cooldown_until) {
          setLastSentMs(new Date(res.cooldown_until).getTime() - COOLDOWN_MS)
          return
        }
        setError(res.error)
        return
      }
      setLastSentMs(new Date(res.sent_at).getTime())
      setShowSentPill(true)
    })
  }

  const buttonTitle = inCooldown
    ? `Recently resent ${hunterName}'s ${waiverLabel} reminder. Wait to resend.`
    : `Resend ${hunterName}'s ${waiverLabel} reminder`

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      {showSentPill ? (
        <span
          className="bb-pill bb-pill-active"
          role="status"
          aria-live="polite"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Check size={12} aria-hidden="true" />
          Sent
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending || inCooldown}
          className="bb-text-action bb-text-action-copper"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 700,
          }}
          aria-label={buttonTitle}
          title={buttonTitle}
        >
          <Send size={12} aria-hidden="true" />
          {isPending
            ? 'Sending'
            : inCooldown
              ? `Resend in ${formatCountdown(remainingMs)}`
              : 'Resend'}
        </button>
      )}
      {!showSentPill && lastSentMs !== null && !inCooldown && (
        <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.7rem' }}>
          Last resent {formatRelative(now - lastSentMs)}
        </span>
      )}
      {error && (
        <span style={{ color: '#8C3C2A', fontSize: '0.7rem' }} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
