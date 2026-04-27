'use client'

import { useState, useTransition } from 'react'
import { Check, UserPlus } from 'lucide-react'
import { addTripParticipantsAction } from './actions'

type Hunter = { id: string; display_name: string }

export default function AddParticipantsForm({
  tripId,
  availableHunters,
}: {
  tripId: string
  availableHunters: Hunter[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (selected.size === 0) return
    const fd = new FormData()
    fd.set('trip_id', tripId)
    selected.forEach((id) => fd.append('hunter_ids', id))
    startTransition(async () => {
      const res = await addTripParticipantsAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      setSelected(new Set())
    })
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 4000

  if (availableHunters.length === 0) {
    return (
      <p className="bb-form-help mt-3">
        All your accepted hunters are already on this trip. Invite more from the Hunters page.
      </p>
    )
  }

  return (
    <details className="mt-3">
      <summary
        className="bb-cta-sm"
        style={{ display: 'inline-flex', cursor: 'pointer', listStyle: 'none' }}
      >
        <UserPlus size={14} aria-hidden="true" />
        Add hunter(s)
      </summary>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 mt-3">
        <div className="flex flex-col gap-1.5">
          {availableHunters.map((h) => {
            const isOn = selected.has(h.id)
            return (
              <label
                key={h.id}
                className="bb-detail-row cursor-pointer"
                style={{
                  borderColor: isOn ? 'var(--color-copper)' : 'var(--color-card-divider)',
                  background: isOn ? '#FBF7F0' : '#FFFFFF',
                }}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(h.id)}
                  className="h-4 w-4 accent-[color:var(--color-copper)]"
                />
                <span className="bb-avatar">{h.display_name.slice(0, 1).toUpperCase()}</span>
                <span className="bb-detail-name">{h.display_name}</span>
              </label>
            )
          })}
        </div>

        {error && (
          <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bb-cta-sm"
            disabled={isPending || selected.size === 0}
          >
            {isPending ? 'Adding...' : `Add ${selected.size || ''}`.trim()}
          </button>
          {showSaved && (
            <span
              className="bb-pill bb-pill-active"
              role="status"
              aria-live="polite"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Check size={12} aria-hidden="true" />
              Added
            </span>
          )}
        </div>
      </form>
    </details>
  )
}
