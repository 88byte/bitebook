'use client'

import { useState, useTransition } from 'react'
import { Check, UserPlus, Mail, Link2, Copy } from 'lucide-react'
import { inviteHunterAction, generateInviteLinkAction } from './actions'

type SuccessMode = 'existing_hunter' | 'new_user'
type InviteMode = 'email' | 'link'

// v27.8.2.1 — segmented control switches between two genuinely separate
// invite paths:
//
//   • Email mode (default): guide enters email → row created with that
//     email → branded invite email sent. Same as pre-v27.8.2.1.
//   • Link mode: zero fields. One tap creates a tokenized invite row
//     with email=NULL, kind='link'. URL appears with Copy button. The
//     accepting hunter supplies their own email at /accept-invite.
//
// Pre-v27.8.2.1 the UI surfaced a "Copy link" button on each existing
// pending row, but only AFTER the guide entered an email and sent.
// Flavio: "you can invite a hunter either by sending email or giving
// them a link" — those are two paths, not one mandatory email path
// with a link as a side-effect.
//
// `compact` renders the single-row inline layout for the banner right
// slot on /app/hunters; default vertical layout stays for the mobile
// body card / standalone use. Both layouts get the segmented control.
export default function InviteForm({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<InviteMode>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [successMode, setSuccessMode] = useState<SuccessMode | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setError(null)
    setSentAt(null)
    setShareUrl(null)
    setSuccessMode(null)
    setSentEmail(null)
    setLinkCopied(false)
  }

  function switchMode(next: InviteMode) {
    if (next === mode) return
    reset()
    setMode(next)
  }

  async function onSubmitEmail(e: React.FormEvent<HTMLFormElement>) {
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
      setSuccessMode(res.mode)
      setSentEmail(submittedEmail)
      setEmail('')
    })
  }

  async function onGenerateLink() {
    setError(null)
    setLinkCopied(false)
    startTransition(async () => {
      const res = await generateInviteLinkAction()
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSentAt(Date.now())
      setShareUrl(res.invite_url)
      setSuccessMode(null) // no email-mode flavor
    })
  }

  async function copyLink() {
    if (!shareUrl || typeof window === 'undefined') return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
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
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 1800)
      } catch {}
    }
  }

  const showSent = sentAt !== null && Date.now() - sentAt < 30000

  // ── Segmented control (shared by both layouts) ────────────────
  const SegControl = (
    <div
      className="bb-invite-tabs"
      role="tablist"
      aria-label="Invite method"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'email'}
        className={`bb-invite-tab ${mode === 'email' ? 'is-active' : ''}`}
        onClick={() => switchMode('email')}
      >
        <Mail size={14} aria-hidden="true" />
        Send email
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'link'}
        className={`bb-invite-tab ${mode === 'link' ? 'is-active' : ''}`}
        onClick={() => switchMode('link')}
      >
        <Link2 size={14} aria-hidden="true" />
        Get link
      </button>
    </div>
  )

  // ── Compact layout (banner right slot) ────────────────────────
  if (compact) {
    return (
      <div className="bb-hero-invite">
        <h2 className="bb-hero-invite-title">Invite hunter</h2>
        {SegControl}

        {mode === 'email' && (
          <form onSubmit={onSubmitEmail}>
            <div className="bb-hero-invite-row">
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
            </div>
          </form>
        )}

        {mode === 'link' && (
          <div className="bb-hero-invite-row">
            {!shareUrl && (
              <button
                type="button"
                className="bb-hero-invite-send"
                disabled={isPending}
                onClick={onGenerateLink}
                style={{ flex: 1 }}
              >
                <Link2 size={14} aria-hidden="true" />
                {isPending ? 'Generating…' : 'Generate share link'}
              </button>
            )}
            {shareUrl && (
              <>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bb-hero-invite-input"
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="bb-hero-invite-send"
                  onClick={copyLink}
                  aria-label={linkCopied ? 'Copied' : 'Copy link'}
                >
                  {linkCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {linkCopied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="bb-hero-invite-msg" style={{ color: '#FFB29A' }}>
            {error}
          </p>
        )}
        {mode === 'email' && showSent && (
          <p role="status" aria-live="polite" className="bb-hero-invite-msg">
            <Check size={12} aria-hidden="true" />{' '}
            {successMode === 'existing_hunter' ? 'Hunter added' : 'Invite sent'}
          </p>
        )}
        {mode === 'link' && shareUrl && (
          <p role="status" aria-live="polite" className="bb-hero-invite-msg">
            Share this link any way you like — text, WhatsApp, in person.
          </p>
        )}
      </div>
    )
  }

  // ── Default vertical layout (mobile body card / standalone) ───
  return (
    <div className="flex flex-col gap-3">
      {SegControl}

      {mode === 'email' && (
        <form onSubmit={onSubmitEmail} className="flex flex-col gap-3">
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
              {successMode === 'existing_hunter' ? 'Hunter added' : 'Invite created'}
            </div>
          )}

          {showSent && successMode === 'existing_hunter' && sentEmail && (
            <div className="bb-form-help">
              {sentEmail} already has a Bite Book account. Added them to your network. They will see new trips at sign-in.
              {shareUrl && (
                <div style={{ marginTop: '0.25rem', wordBreak: 'break-all', color: 'var(--color-ink-soft)' }}>
                  Sign-in URL: <a href={shareUrl} className="bb-callout-link">{shareUrl}</a>
                </div>
              )}
            </div>
          )}

          {showSent && successMode === 'new_user' && shareUrl && (
            <div className="bb-form-help" style={{ wordBreak: 'break-all' }}>
              Share link: <a href={shareUrl} className="bb-callout-link">{shareUrl}</a>
            </div>
          )}
        </form>
      )}

      {mode === 'link' && (
        <div className="flex flex-col gap-3">
          <p className="bb-form-help" style={{ margin: 0 }}>
            Generate a unique invite link you can share by text, WhatsApp, or in person. The hunter fills in their own email when they accept.
          </p>

          {error && (
            <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>{error}</p>
          )}

          {!shareUrl && (
            <button
              type="button"
              className="bb-cta-block"
              disabled={isPending}
              onClick={onGenerateLink}
            >
              <Link2 size={18} aria-hidden="true" />
              {isPending ? 'Generating…' : 'Generate share link'}
            </button>
          )}

          {shareUrl && (
            <>
              <label className="bb-field">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bb-input"
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="bb-cta-block"
                onClick={copyLink}
              >
                {linkCopied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                {linkCopied ? 'Copied' : 'Copy link'}
              </button>
              <p className="bb-form-help" style={{ margin: 0 }}>
                Send this anywhere. The link works until accepted, canceled, or expired.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
