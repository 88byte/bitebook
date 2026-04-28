'use client'

import { useState, useTransition } from 'react'
import { Check, UserPlus, X } from 'lucide-react'
import { inviteHunterAction } from '../../hunters/actions'

export type HunterOption = { id: string; display_name: string }

type Props = {
  hunters: HunterOption[]
  selected: Set<string>
  onToggle: (id: string) => void
  // When the inline-invite path resolves an existing hunter, we add them to
  // the local list (auto-selected) so the guide doesn't have to re-find them.
  onAddHunter: (h: HunterOption, autoSelect: boolean) => void
}

// v26.3: shared multi-select used by NewTripForm + EditTripForm. Replaces the
// flat checkbox list with a header (count + label), an inline "Invite a new
// hunter" affordance, and clearer selected-state styling. Auto-accept (existing
// hunter) flows immediately put the new hunter in the list and check them on.
// New-user invites surface a passive "we sent the invite — they'll show up
// once they accept" message; the new email is NOT auto-selected because we
// don't yet have a profile.id to attach as a participant.
export default function HuntersMultiSelect({
  hunters,
  selected,
  onToggle,
  onAddHunter,
}: Props) {
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [pendingNote, setPendingNote] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setInviteError(null)
    setPendingNote(null)

    const fd = new FormData()
    fd.set('email', inviteEmail)

    startTransition(async () => {
      const res = await inviteHunterAction(fd)
      if ('error' in res) {
        setInviteError(res.error)
        return
      }

      if (res.mode === 'existing_hunter') {
        // We don't have a profile.id back from inviteHunterAction directly,
        // but the parent will reconcile on the next fetch. For now, push a
        // synthetic option using email so the UI shows immediate feedback,
        // and rely on the next render after revalidatePath('/app/hunters')
        // to swap in the canonical row.
        // NOTE: passing autoSelect=false because we need the real profile.id
        // before we can include this hunter as a trip participant.
        onAddHunter(
          { id: `pending:${inviteEmail.toLowerCase()}`, display_name: inviteEmail },
          false
        )
        setPendingNote(
          `${inviteEmail} already had a Bite Book account — added them to your network. Refresh the page to add them to this trip.`
        )
      } else {
        setPendingNote(
          `Invite sent to ${inviteEmail}. Once they accept, you can add them to this trip.`
        )
      }
      setInviteEmail('')
      setShowInvite(false)
    })
  }

  const totalLabel = hunters.length === 1 ? 'hunter' : 'hunters'
  const selectedCount = Array.from(selected).filter((id) => !id.startsWith('pending:')).length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
          {hunters.length === 0
            ? 'No accepted hunters yet.'
            : `${selectedCount} of ${hunters.length} ${totalLabel} selected`}
        </span>
        <button
          type="button"
          onClick={() => {
            setShowInvite((v) => !v)
            setInviteError(null)
          }}
          className="bb-text-action"
          style={{ color: 'var(--color-copper)', fontSize: '0.78rem', fontWeight: 600 }}
        >
          {showInvite ? (
            <>
              <X size={12} aria-hidden="true" /> Close
            </>
          ) : (
            <>
              <UserPlus size={12} aria-hidden="true" /> Invite a new hunter
            </>
          )}
        </button>
      </div>

      {showInvite && (
        <form
          onSubmit={submitInvite}
          className="bb-tile"
          style={{ padding: '0.75rem' }}
        >
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="invite_inline_email">
              Email
            </label>
            <input
              id="invite_inline_email"
              name="email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="hunter@example.com"
              className="bb-input"
              maxLength={200}
              autoComplete="off"
            />
          </div>
          {inviteError && (
            <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">
              {inviteError}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button type="submit" className="bb-cta-sm" disabled={isPending}>
              <UserPlus size={14} aria-hidden="true" />
              {isPending ? 'Sending...' : 'Send invite'}
            </button>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={() => {
                setShowInvite(false)
                setInviteEmail('')
                setInviteError(null)
              }}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
          <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
            New users get an email invite. Existing Bite Book hunters are added to
            your network instantly.
          </p>
        </form>
      )}

      {pendingNote && (
        <div
          className="bb-tile"
          role="status"
          style={{ padding: '0.65rem 0.85rem', borderColor: 'var(--color-copper)' }}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--color-ink)' }}>{pendingNote}</p>
        </div>
      )}

      {hunters.length === 0 ? (
        <p className="bb-form-help">
          Use the &ldquo;Invite a new hunter&rdquo; link above to add your first hunter.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {hunters.map((h) => {
            const isOn = selected.has(h.id)
            const isPendingInvite = h.id.startsWith('pending:')
            return (
              <label
                key={h.id}
                className="bb-detail-row cursor-pointer"
                style={{
                  borderColor: isOn ? 'var(--color-copper)' : 'var(--color-card-divider)',
                  background: isOn ? '#FBF7F0' : '#FFFFFF',
                  borderWidth: isOn ? '2px' : '1px',
                  opacity: isPendingInvite ? 0.7 : 1,
                  cursor: isPendingInvite ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => !isPendingInvite && onToggle(h.id)}
                  disabled={isPendingInvite}
                  className="h-4 w-4 accent-[color:var(--color-copper)]"
                  aria-label={`Select ${h.display_name}`}
                />
                <span className="bb-avatar" aria-hidden="true">
                  {h.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="bb-detail-name">{h.display_name}</div>
                  {isPendingInvite && (
                    <div className="bb-detail-sub">Just invited - refresh to add to trip</div>
                  )}
                </div>
                {isOn && !isPendingInvite && (
                  <Check
                    size={16}
                    aria-hidden="true"
                    style={{ color: 'var(--color-copper)', flexShrink: 0 }}
                  />
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
