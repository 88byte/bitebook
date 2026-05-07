'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Check, ExternalLink, Users } from 'lucide-react'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import { syncTripParticipantsAction } from './actions'
import TripShareLinkButton from './TripShareLinkButton'
import DeleteWaiverButton from './DeleteWaiverButton'
import ResendWaiverButton from './ResendWaiverButton'

// v27.3.8.1 item 1 — combined "Hunters on this trip" panel.
// v27.3.8.2 bug 1 — toggle freeze fix:
//   (a) walletLinksByHunter prop changed from Map -> plain object so
//       it serializes cleanly across the RSC boundary on revalidation.
//       Map is technically supported in Next.js 16 RSC payloads but
//       was tripping serialization on revalidate-after-action here.
//   (b) commitSelection moved OUT of the setSelected updater so the
//       server action only fires once per click (StrictMode was
//       running the updater twice and firing duplicate actions).
//   (c) selected state now resyncs from initialSelectedIds when the
//       parent re-renders post-revalidation, so the checkbox UI
//       matches the canonical participant list after the round-trip.

export type WalletLink = {
  id: string
  type: string
  identifier: string
  species: string | null
}

export type WalletLinksByHunter = Record<string, WalletLink[]>

// v27.9.8a.1 — per-hunter waiver status emitted by the server query in
// trip-doc-queries.ts. One entry per (hunter, waiver-doc) pair.
// signed=true → completed_at populated + signedUrl from admin storage.
export type WaiverStatusEntry = {
  actionId: string
  tripDocId: string
  docId: string
  label: string
  signed: boolean
  signedAt: string | null
  signedUrl: string | null
  // v27.9.8a.1.1 — last_sent_at for the Resend cooldown UI. null = never
  // pinged the hunter via Resend yet (the original assign email doesn't
  // count as a "resend" for cooldown purposes).
  lastSentAt: string | null
}

export type WaiverStatusByHunter = Record<string, WaiverStatusEntry[]>

export type ParticipantRow = {
  id: string
  hunter_id: string | null
  guest_name: string | null
  role: string
  profile: { id: string; display_name: string } | null
}

type Props = {
  tripId: string
  // v27.9.1 — surfaced for the share-link helper copy and 30-day-style
  // expiration messaging; trickles into TripShareLinkButton.
  tripTitle: string
  participants: ParticipantRow[]
  walletLinksByHunter: WalletLinksByHunter
  waiverStatusByHunter: WaiverStatusByHunter
  candidates: HunterOption[]
  initialSelectedIds: string[]
  speciesTargeted: string | null
  canManage: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase() || '?'
}

export default function HuntersOnTripPanel({
  tripId,
  tripTitle,
  participants,
  walletLinksByHunter,
  waiverStatusByHunter,
  candidates,
  initialSelectedIds,
  speciesTargeted,
  canManage,
}: Props) {
  const [hunterList, setHunterList] = useState<HunterOption[]>(candidates)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedIds))
  const [showManage, setShowManage] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // v27.3.8.2 bug 1 — resync `selected` when the parent re-renders
  // post-revalidation. Without this, the local state forks from the
  // server's canonical list after a successful sync. signature is the
  // sorted-joined set so toggling a hunter back-and-forth doesn't
  // bounce the resync.
  const initialSig = [...initialSelectedIds].sort().join(',')
  const lastSyncedSig = useRef(initialSig)
  useEffect(() => {
    if (lastSyncedSig.current !== initialSig) {
      lastSyncedSig.current = initialSig
      setSelected(new Set(initialSelectedIds))
    }
  }, [initialSig, initialSelectedIds])

  // v27.3.8.2 bug 1 — keep candidates fresh too. After invite/auto-
  // accept, the server-side accepted list grows; the panel should
  // reflect the new option without losing inline-added entries.
  useEffect(() => {
    setHunterList((prev) => {
      const seen = new Set(prev.map((h) => h.id))
      const merged = [...prev]
      for (const c of candidates) {
        if (!seen.has(c.id)) merged.push(c)
      }
      return merged
    })
  }, [candidates])

  const anyPending = useMemo(() => {
    return participants.some((p) => {
      if (!p.hunter_id) return false
      const links = walletLinksByHunter[p.hunter_id] ?? []
      const hasLicense = links.some((l) => l.type === 'license')
      const hasTag = links.some((l) => l.type === 'tag')
      if (!hasLicense) return true
      if (!hasTag && speciesTargeted) return true
      return false
    })
  }, [participants, walletLinksByHunter, speciesTargeted])

  const sectionTitle = anyPending ? 'Hunters still needing action' : 'Hunters on this trip'

  function commitSelection(next: Set<string>) {
    setError(null)
    const ids = Array.from(next).filter((id) => !id.startsWith('pending:'))
    startTransition(async () => {
      const res = await syncTripParticipantsAction(tripId, ids)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
    })
  }

  // v27.3.8.2 bug 1 — toggleHunter computes next state from the
  // current `selected` Set OUTSIDE the setter updater. The previous
  // implementation called commitSelection inside setSelected's
  // updater, which under StrictMode runs twice and fired duplicate
  // server actions, leading to revalidate races + the "this page
  // couldn't load" error.
  function toggleHunter(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    commitSelection(next)
  }

  function addHunter(h: HunterOption, autoSelect: boolean) {
    setHunterList((prev) => (prev.some((x) => x.id === h.id) ? prev : [...prev, h]))
    if (autoSelect) {
      const next = new Set(selected)
      next.add(h.id)
      setSelected(next)
      commitSelection(next)
    }
  }

  return (
    <section className="bb-tile bb-form-section mt-4">
      <div className="bb-tile-body">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <h2
            className="bb-form-section-head"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}
          >
            <Users size={16} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
            {sectionTitle}
          </h2>
          {canManage && (
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={() => setShowManage((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              {showManage ? 'Done' : 'Manage hunters'}
            </button>
          )}
        </div>

        {participants.length === 0 ? (
          <p className="bb-form-help" style={{ marginTop: '0.6rem' }}>
            No hunters on this trip yet. Tap{' '}
            <strong>Manage hunters</strong> to add some from your network.
          </p>
        ) : (
          <div className="bb-detail-list" style={{ marginTop: '0.5rem' }}>
            {participants.map((p) => {
              const name = p.profile?.display_name ?? p.guest_name ?? 'Unnamed hunter'
              const links = p.hunter_id ? walletLinksByHunter[p.hunter_id] ?? [] : []
              const hasLicense = links.some((l) => l.type === 'license')
              const hasTag = links.some((l) => l.type === 'tag')
              const pendingPills: string[] = []
              if (p.hunter_id) {
                if (!hasLicense) pendingPills.push('license')
                if (!hasTag && speciesTargeted) pendingPills.push('tag')
              }
              const waiverEntries = p.hunter_id
                ? waiverStatusByHunter[p.hunter_id] ?? []
                : []
              return (
                <div key={p.id} className="bb-detail-row">
                  <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bb-detail-name">{name}</div>
                    <div className="bb-detail-sub">
                      {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                    </div>
                    {/* v27.9.8a.1 — waiver status row. Only renders for
                        real Bite Book hunters (guests can't be assigned
                        actions). 0 entries = "No waiver required",
                        1 entry = single pill, 2+ = aggregate pill +
                        per-waiver expand. */}
                    {p.hunter_id && (
                      <HunterWaiverStatusBlock
                        hunterName={name}
                        entries={waiverEntries}
                      />
                    )}
                    {(links.length > 0 || pendingPills.length > 0) && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          marginTop: '0.4rem',
                        }}
                      >
                        {links.map((l) => {
                          const typeLabel =
                            l.type === 'license'
                              ? 'License'
                              : l.type === 'tag'
                                ? 'Tag'
                                : l.type === 'permit'
                                  ? 'Permit'
                                  : l.type === 'stamp'
                                    ? 'Stamp'
                                    : 'Doc'
                          return (
                            <span
                              key={l.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                background: 'var(--color-paper-tint)',
                                border: '1px solid var(--color-ink-tint)',
                                fontSize: '0.78rem',
                                color: 'var(--color-ink)',
                              }}
                            >
                              <strong style={{ fontWeight: 600 }}>{typeLabel}:</strong>{' '}
                              {l.identifier}
                              {l.species ? ` · ${l.species}` : ''}
                              {' ✓'}
                            </span>
                          )
                        })}
                        {pendingPills.map((kind) => (
                          <span
                            key={`pending-${kind}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              background: 'var(--color-copper)',
                              color: '#fff',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                            }}
                          >
                            Pending: {kind}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showManage && canManage && (
          <div style={{ marginTop: '0.75rem' }}>
            <span className="bb-form-label">Add or remove hunters</span>
            <HuntersMultiSelect
              hunters={hunterList}
              selected={selected}
              onToggle={toggleHunter}
              onAddHunter={addHunter}
            />
            <p
              className="bb-form-help"
              style={{ marginTop: '0.4rem', color: pending ? 'var(--color-ink-soft)' : undefined }}
            >
              {pending
                ? 'Saving…'
                : error
                  ? error
                  : savedAt !== null
                    ? 'Saved.'
                    : 'Toggling a hunter saves immediately.'}
            </p>

            {/* v27.9.1 — trip-scoped share-link surface. Sits below the
                multi-select inside the same Manage block so guides
                hit it in the natural "add hunters" flow. */}
            <TripShareLinkButton tripId={tripId} tripTitle={tripTitle} />
          </div>
        )}
      </div>
    </section>
  )
}

// v27.9.8a.1 — per-hunter waiver-status pill block. Shapes:
//   • 0 entries → "No waiver required" (muted pill)
//   • 1 entry signed → "Signed waiver" + Open + Reset
//   • 1 entry pending → "Pending waiver"
//   • 2+ entries → "Waivers: X of Y signed" aggregate, with a
//     <details> expand listing each waiver's pill + actions
function pillBase(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.15rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.78rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }
}
function neutralPill(): React.CSSProperties {
  return {
    ...pillBase(),
    background: 'var(--color-paper-tint)',
    border: '1px solid var(--color-ink-tint)',
    color: 'var(--color-ink-soft)',
  }
}
function pendingPill(): React.CSSProperties {
  return {
    ...pillBase(),
    background: '#F2D6CE',
    color: '#8C3C2A',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '0.72rem',
    fontWeight: 700,
  }
}
function signedPill(): React.CSSProperties {
  return {
    ...pillBase(),
    background: '#DDE7DD',
    color: '#2F5233',
    fontWeight: 700,
  }
}

function SignedActions({
  hunterName,
  entry,
}: {
  hunterName: string
  entry: WaiverStatusEntry
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
      {entry.signedUrl && (
        <a
          href={entry.signedUrl}
          target="_blank"
          rel="noopener noreferrer"
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
          aria-label={`Open ${hunterName}'s ${entry.label}`}
        >
          <ExternalLink size={12} aria-hidden="true" />
          Open
        </a>
      )}
      <DeleteWaiverButton
        actionId={entry.actionId}
        hunterName={hunterName}
        waiverLabel={entry.label}
      />
    </span>
  )
}

// v27.9.8a.1.1 — Resend nudge for pending waiver rows. Single
// component used in both the 1-entry and N-entry shapes.
function PendingResend({
  hunterName,
  entry,
}: {
  hunterName: string
  entry: WaiverStatusEntry
}) {
  return (
    <ResendWaiverButton
      actionId={entry.actionId}
      lastSentAt={entry.lastSentAt}
      hunterName={hunterName}
      waiverLabel={entry.label}
    />
  )
}

function HunterWaiverStatusBlock({
  hunterName,
  entries,
}: {
  hunterName: string
  entries: WaiverStatusEntry[]
}) {
  const wrap: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
    marginTop: '0.4rem',
  }
  if (entries.length === 0) {
    return (
      <div style={wrap}>
        <span style={neutralPill()}>No waiver required</span>
      </div>
    )
  }
  if (entries.length === 1) {
    const e = entries[0]
    return (
      <div style={wrap}>
        {e.signed ? (
          <>
            <span style={signedPill()}>
              <Check size={11} aria-hidden="true" />
              Signed waiver
            </span>
            <SignedActions hunterName={hunterName} entry={e} />
          </>
        ) : (
          <>
            <span style={pendingPill()}>Pending waiver</span>
            <PendingResend hunterName={hunterName} entry={e} />
          </>
        )}
      </div>
    )
  }
  // 2+ waivers — aggregate pill + expand.
  const signedCount = entries.filter((e) => e.signed).length
  const allSigned = signedCount === entries.length
  return (
    <div style={{ marginTop: '0.4rem' }}>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            listStyle: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span style={allSigned ? signedPill() : pendingPill()}>
            {allSigned && <Check size={11} aria-hidden="true" />}
            Waivers: {signedCount} of {entries.length} signed
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--color-copper)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            View
          </span>
        </summary>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0.5rem 0 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          {entries.map((e) => (
            <li
              key={e.actionId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: 'var(--color-ink)' }}>{e.label}</span>
              {e.signed ? (
                <>
                  <span style={signedPill()}>
                    <Check size={11} aria-hidden="true" />
                    Signed
                  </span>
                  <SignedActions hunterName={hunterName} entry={e} />
                </>
              ) : (
                <>
                  <span style={pendingPill()}>Pending</span>
                  <PendingResend hunterName={hunterName} entry={e} />
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
