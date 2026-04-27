'use client'

import { useState, useTransition } from 'react'
import { Check, UserPlus } from 'lucide-react'
import { inviteHunterAction } from './actions'

export default function InviteForm() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await inviteHunterAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSentAt(Date.now())
      setShareUrl(res.invite_url ?? null)
      setEmail('')
      setFirstName('')
    })
  }

  const showSent = sentAt !== null && Date.now() - sentAt < 30000

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="invite_email">Email</label>
        <input
          id="invite_email"
          name="email"
          type="email"
          className="bb-input"
          required
          placeholder="hunter@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="invite_first_name">First name (optional)</label>
        <input
          id="invite_first_name"
          name="first_name"
          type="text"
          className="bb-input"
          placeholder="Used in the invite email"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          maxLength={60}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="bb-cta-sm" disabled={isPending}>
          <UserPlus size={16} aria-hidden="true" />
          {isPending ? 'Sending...' : 'Send invite'}
        </button>
        {showSent && (
          <span
            className="bb-pill bb-pill-active"
            role="status"
            aria-live="polite"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Check size={12} aria-hidden="true" />
            Invite created
          </span>
        )}
      </div>

      {showSent && shareUrl && (
        <div className="bb-form-help" style={{ wordBreak: 'break-all' }}>
          Share link: <a href={shareUrl} className="bb-callout-link">{shareUrl}</a>
        </div>
      )}
    </form>
  )
}
