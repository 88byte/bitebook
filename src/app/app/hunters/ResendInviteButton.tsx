'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { resendInviteAction } from './actions'

const COOLDOWN_MS = 5 * 60 * 1000

// "M:SS" countdown format used inside the button caption.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// "HH:MM" wall-clock format for the tooltip readiness time.
function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Terse relative timestamp ("just now", "X min ago", "X hours ago", "X days ago").
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

export default function ResendInviteButton({
  inviteId,
  email,
  lastSentAt,
}: {
  inviteId: string
  email: string
  lastSentAt: string
}) {
  // Local cooldown anchor — initialized from the server-supplied timestamp,
  // updated on successful resend or when the server reports a cooldown
  // (handles client/server clock-skew cleanly).
  const [lastSentMs, setLastSentMs] = useState<number>(() => new Date(lastSentAt).getTime())
  const [now, setNow] = useState<number>(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [showSentPill, setShowSentPill] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Tick once a second so the countdown stays current. The setInterval is
  // cheap and only runs while the row is mounted.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Sync if the server prop changes (e.g. after revalidation on nav).
  useEffect(() => {
    setLastSentMs(new Date(lastSentAt).getTime())
  }, [lastSentAt])

  // Auto-clear the "Resent" pill after 4s.
  useEffect(() => {
    if (!showSentPill) return
    const id = setTimeout(() => setShowSentPill(false), 4000)
    return () => clearTimeout(id)
  }, [showSentPill])

  const cooldownUntilMs = lastSentMs + COOLDOWN_MS
  const remainingMs = cooldownUntilMs - now
  const inCooldown = remainingMs > 0

  function onClick() {
    setError(null)
    const fd = new FormData()
    fd.set('invite_id', inviteId)
    startTransition(async () => {
      const res = await resendInviteAction(fd)
      if ('error' in res) {
        if (res.error === 'cooldown' && res.cooldown_until) {
          // Align local cooldown to the server's "until" time, then back
          // out to a synthetic last-sent anchor so the existing math works.
          setLastSentMs(new Date(res.cooldown_until).getTime() - COOLDOWN_MS)
          return
        }
        setError(res.error)
        return
      }
      setLastSentMs(Date.now())
      setShowSentPill(true)
    })
  }

  const readyAtLabel = formatClock(new Date(cooldownUntilMs))
  const buttonTitle = inCooldown
    ? `Recently resent. Wait until ${readyAtLabel} to resend.`
    : `Resend invite to ${email}`

  const lastResentLabel = `Last resent ${formatRelative(now - lastSentMs)}`

  return (
    <div className="flex flex-col items-end gap-1">
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
          aria-label={buttonTitle}
          title={buttonTitle}
        >
          {isPending ? 'Sending' : inCooldown ? 'Resend' : 'Resend'}
        </button>
      )}
      {inCooldown ? (
        <span
          style={{ color: 'var(--color-ink-soft)', fontSize: '0.7rem' }}
          aria-live="polite"
        >
          Resent recently. Try again in {formatCountdown(remainingMs)}
        </span>
      ) : (
        <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.7rem' }}>
          {lastResentLabel}
        </span>
      )}
      {error && (
        <span style={{ color: '#8C3C2A', fontSize: '0.7rem' }} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
