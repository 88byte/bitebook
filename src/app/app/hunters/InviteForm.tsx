'use client'

import { useState, useTransition } from 'react'
import { Check, UserPlus, Mail } from 'lucide-react'
import { inviteHunterAction } from './actions'

type SuccessMode = 'existing_hunter' | 'new_user'

// v27.3.3.2 — `compact` renders a single-row inline layout for use
// inside the /app/hunters banner right slot. Default vertical layout
// stays for the mobile body card / standalone use.
export default function InviteForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<SuccessMode | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const submittedEmail = email
    startTransition(async () => {
      const res = await inviteHunterAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSentAt(Date.now())
      setShareUrl(res.invite_url ?? null)
      setMode(res.mode)
      setSentEmail(submittedEmail)
      setEmail('')
    })
  }

  const showSent = sentAt !== null && Date.now() - sentAt < 30000

  if (compact) {
    return (
      <form onSubmit={onSubmit} className="bb-hero-invite">
        <span className="bb-hero-invite-label">Invite a hunter</span>
        <input
          name="email"
          type="email"
          className="bb-hero-invite-input"
          required
          placeholder="hunter@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          aria-label="Hunter email"
        />
        <button type="submit" className="bb-hero-invite-send" disabled={isPending}>
          <UserPlus size={14} aria-hidden="true" />
          {isPending ? 'Sending…' : 'Send'}
        </button>
        {error && (
          <p role="alert" className="bb-hero-invite-msg" style={{ color: '#FFB29A' }}>
            {error}
          </p>
        )}
        {showSent && (
          <p role="status" aria-live="polite" className="bb-hero-invite-msg">
            <Check size={12} aria-hidden="true" />{' '}
            {mode === 'existing_hunter' ? 'Hunter added' : 'Invite sent'}
          </p>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="invite_email">Email</label>
        <label className="bb-field">
          <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
          <input
            id="invite_email"
            name="email"
            type="email"
            className="bb-input bb-input-iconed"
            required
            placeholder="hunter@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />
        </label>
      </div>

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>{error}</p>
      )}

      <button type="submit" className="bb-cta-block" disabled={isPending}>
        <UserPlus size={18} aria-hidden="true" />
        {isPending ? 'Sending...' : 'Send invite'}
      </button>

      {showSent && (
        <div
          className="bb-pill bb-pill-active"
          role="status"
          aria-live="polite"
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Check size={12} aria-hidden="true" />
          {mode === 'existing_hunter' ? 'Hunter added' : 'Invite created'}
        </div>
      )}

      {showSent && mode === 'existing_hunter' && sentEmail && (
        <div className="bb-form-help">
          {sentEmail} already has a Bite Book account. Added them to your network. They will see new trips at sign-in.
          {shareUrl && (
            <div style={{ marginTop: '0.25rem', wordBreak: 'break-all', color: 'var(--color-ink-soft)' }}>
              Sign-in URL: <a href={shareUrl} className="bb-callout-link">{shareUrl}</a>
            </div>
          )}
        </div>
      )}

      {showSent && mode === 'new_user' && shareUrl && (
        <div className="bb-form-help" style={{ wordBreak: 'break-all' }}>
          Share link: <a href={shareUrl} className="bb-callout-link">{shareUrl}</a>
        </div>
      )}
    </form>
  )
}
