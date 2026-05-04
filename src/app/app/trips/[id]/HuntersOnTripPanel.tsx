'use client'

import { useMemo, useState, useTransition } from 'react'
import { Users } from 'lucide-react'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import { syncTripParticipantsAction } from './actions'

// v27.3.8.1 item 1 — combined "Hunters on this trip" panel.
// Replaces the previous split between (a) read-only status panel on
// trip detail page and (b) Hunters accordion in TripDetailEditor that
// owned add/remove. One section now: status pills per hunter + a
// "Manage hunters" toggle that reveals HuntersMultiSelect inline and
// auto-saves participant sync.

export type WalletLink = {
  id: string
  type: string
  identifier: string
  species: string | null
}

export type ParticipantRow = {
  id: string
  hunter_id: string | null
  guest_name: string | null
  role: string
  profile: { id: string; display_name: string } | null
}

type Props = {
  tripId: string
  participants: ParticipantRow[]
  walletLinksByHunter: Map<string, WalletLink[]>
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
  participants,
  walletLinksByHunter,
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

  const anyPending = useMemo(() => {
    return participants.some((p) => {
      if (!p.hunter_id) return false
      const links = walletLinksByHunter.get(p.hunter_id) ?? []
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

  function toggleHunter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      commitSelection(next)
      return next
    })
  }

  function addHunter(h: HunterOption, autoSelect: boolean) {
    setHunterList((prev) => (prev.some((x) => x.id === h.id) ? prev : [...prev, h]))
    if (autoSelect) {
      setSelected((prev) => {
        const next = new Set(prev)
        next.add(h.id)
        commitSelection(next)
        return next
      })
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
              const links = p.hunter_id ? walletLinksByHunter.get(p.hunter_id) ?? [] : []
              const hasLicense = links.some((l) => l.type === 'license')
              const hasTag = links.some((l) => l.type === 'tag')
              const pendingPills: string[] = []
              if (p.hunter_id) {
                if (!hasLicense) pendingPills.push('license')
                if (!hasTag && speciesTargeted) pendingPills.push('tag')
              }
              return (
                <div key={p.id} className="bb-detail-row">
                  <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="bb-detail-name">{name}</div>
                    <div className="bb-detail-sub">
                      {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                    </div>
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
          </div>
        )}
      </div>
    </section>
  )
}
