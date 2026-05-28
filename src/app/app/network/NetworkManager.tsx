'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, RotateCw, Link2, Trash2, Check } from 'lucide-react'
import type { NetworkSnapshot } from './actions'
import {
  inviteOutfitterGuideAction,
  resendOutfitterGuideInviteAction,
  revokeOutfitterGuideInviteAction,
  removeOutfitterGuideAction,
  getOutfitterGuideInviteUrlAction,
} from './actions'

// v28.1.0e.0 Sprint 3.3 — Network management UI for /app/network.
// Mirrors OutfitterAdminTeam.tsx in shape but for the guide network:
//   • Both owner and admin can invite (no is_owner gate).
//   • No seat counter; the network is unbounded.
//   • Remove acts on outfitter_guide_network row, not org_members.

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function NetworkManager({ snapshot }: { snapshot: NetworkSnapshot }) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [debugUrl, setDebugUrl] = useState<{ inviteId: string; url: string } | null>(null)

  function flash(msg: string) {
    setSavedFlash(msg)
    setTimeout(() => setSavedFlash((cur) => (cur === msg ? null : cur)), 3500)
  }

  function submitInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await inviteOutfitterGuideAction(fd)
      if ('error' in res) {
        setError(res.error)
      } else {
        setInviteOpen(false)
        setEmail('')
        flash('Invite sent')
        router.refresh()
      }
    })
  }

  function onResend(inviteId: string) {
    setError(null)
    startTransition(async () => {
      const res = await resendOutfitterGuideInviteAction(inviteId)
      if ('error' in res) setError(res.error)
      else { flash('Invite resent'); router.refresh() }
    })
  }

  function onRevoke(inviteId: string, em: string) {
    if (!window.confirm(`Revoke the invite to ${em}? The current link will stop working.`)) return
    setError(null)
    startTransition(async () => {
      const res = await revokeOutfitterGuideInviteAction(inviteId)
      if ('error' in res) setError(res.error)
      else { flash('Invite revoked'); router.refresh() }
    })
  }

  function onRemove(networkId: string, name: string) {
    if (!window.confirm(`Remove ${name} from your guide network? They will lose access to your org but their account stays active.`)) return
    setError(null)
    startTransition(async () => {
      const res = await removeOutfitterGuideAction(networkId)
      if ('error' in res) setError(res.error)
      else { flash('Guide removed'); router.refresh() }
    })
  }

  function onCopyInviteUrl(inviteId: string) {
    setError(null)
    startTransition(async () => {
      const res = await getOutfitterGuideInviteUrlAction(inviteId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      try {
        await navigator.clipboard.writeText(res.url)
        flash('Invite URL copied')
      } catch {
        setDebugUrl({ inviteId, url: res.url })
      }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p className="bb-form-help" style={{ margin: 0 }}>
          <strong>{snapshot.guides.length}</strong> active {snapshot.guides.length === 1 ? 'guide' : 'guides'} in your network
          {snapshot.pending.length > 0 ? ` · ${snapshot.pending.length} pending` : ''}.
        </p>
        <button
          type="button"
          className="bb-cta-sm"
          onClick={() => { setError(null); setInviteOpen(true) }}
          disabled={pending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <UserPlus size={14} aria-hidden="true" />
          Invite guide
        </button>
      </div>

      {savedFlash && (
        <p role="status" aria-live="polite" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#3F6B3A' }}>
          <Check size={12} aria-hidden="true" style={{ display: 'inline', marginRight: 4 }} />
          {savedFlash}
        </p>
      )}

      {error && (
        <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}

      {/* Active guides */}
      {snapshot.guides.length === 0 ? (
        <div className="bb-empty" style={{ marginTop: '0.75rem' }}>
          <div className="bb-empty-title">No guides in your network yet</div>
          <p className="bb-empty-sub">Invite your first guide by email. Their seat is covered by your subscription.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {snapshot.guides.map((g) => (
            <li
              key={g.network_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                border: '1px solid var(--color-card-divider)',
                borderRadius: 8,
                background: '#FFFFFF',
              }}
            >
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '0.95rem' }}>
                  {g.display_name || 'Guide'}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-muted)', overflowWrap: 'anywhere' }}>
                  {g.email || ''}
                </div>
                {g.accepted_at && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
                    Joined {fmtDate(g.accepted_at)}
                  </div>
                )}
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 999,
                  background: 'rgba(63, 107, 58, 0.14)',
                  color: '#2F5A2A',
                }}
              >
                Guide
              </span>
              <button
                type="button"
                onClick={() => onRemove(g.network_id, g.display_name)}
                disabled={pending}
                aria-label={`Remove ${g.display_name}`}
                className="bb-text-action"
                style={{
                  flexShrink: 0,
                  minWidth: 36,
                  minHeight: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A33D3D',
                }}
                title="Remove from network"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Pending invites */}
      {snapshot.pending.length > 0 && (
        <div style={{ marginTop: '0.9rem' }}>
          <h4 className="bb-section-title" style={{ margin: '0 0 0.4rem' }}>Pending invites</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {snapshot.pending.map((p) => (
              <li
                key={p.invite_id}
                style={{
                  padding: '0.6rem 0.75rem',
                  border: '1px dashed var(--color-card-divider)',
                  borderRadius: 8,
                  background: 'var(--color-paper-tint)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-ink)', overflowWrap: 'anywhere' }}>
                      {p.invited_email}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
                      Invited {fmtDate(p.created_at)} · expires {fmtDate(p.expires_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => onResend(p.invite_id)}
                      disabled={pending}
                      className="bb-text-action bb-text-action-copper"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', minHeight: 36, padding: '0 0.5rem' }}
                    >
                      <RotateCw size={12} aria-hidden="true" />
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevoke(p.invite_id, p.invited_email)}
                      disabled={pending}
                      className="bb-text-action"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', minHeight: 36, padding: '0 0.5rem', color: '#A33D3D' }}
                    >
                      <X size={12} aria-hidden="true" />
                      Revoke
                    </button>
                    {snapshot.test_bypass && (
                      <button
                        type="button"
                        onClick={() => onCopyInviteUrl(p.invite_id)}
                        disabled={pending}
                        className="bb-text-action"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', minHeight: 36, padding: '0 0.5rem', color: 'var(--color-ink-muted)' }}
                        title="Copy raw invite URL (admin only)"
                      >
                        <Link2 size={12} aria-hidden="true" />
                        Copy link
                      </button>
                    )}
                  </div>
                </div>
                {debugUrl?.inviteId === p.invite_id && (
                  <p className="bb-form-help" style={{ marginTop: '0.4rem', overflowWrap: 'anywhere' }}>
                    Copy this URL: <code>{debugUrl.url}</code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-guide-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11, 8, 6, 0.55)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false) }}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 12,
              padding: '1.25rem',
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h2 id="invite-guide-title" className="bb-form-section-head" style={{ marginTop: 0 }}>Invite a guide</h2>
            <p className="bb-form-help" style={{ marginTop: 0 }}>
              They will get an email with a one-time accept link. When they accept, they can run trips and log harvests under your outfitter. Their seat is covered by your subscription.
            </p>
            <form onSubmit={submitInvite} style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="invite_guide_email">Email address</label>
              <input
                id="invite_guide_email"
                name="email"
                type="email"
                className="bb-input"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guide@example.com"
                maxLength={200}
                autoComplete="off"
              />
              {error && (
                <p role="alert" className="bb-form-help" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
                  {error}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="bb-btn-secondary"
                  onClick={() => { setError(null); setInviteOpen(false) }}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button type="submit" className="bb-cta-sm" disabled={pending}>
                  {pending ? 'Sending...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
