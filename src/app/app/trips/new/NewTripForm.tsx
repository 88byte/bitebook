'use client'

import { useState, useTransition } from 'react'
import { Calendar, MapPin, Users, FileText, Target } from 'lucide-react'
import { createTripAction } from '../actions'

type Hunter = { id: string; display_name: string }

export default function NewTripForm({ hunters }: { hunters: Hunter[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    selected.forEach((id) => fd.append('hunter_ids', id))
    startTransition(async () => {
      try {
        await createTripAction(fd)
      } catch (err) {
        // redirect() throws a Next.js redirect signal we should not catch — only
        // catch real errors. If the message looks like the redirect we re-throw.
        const e = err as Error & { digest?: string }
        if (e.digest?.startsWith('NEXT_REDIRECT')) throw err
        setError(e.message ?? 'Could not create trip.')
      }
    })
  }

  function toggleHunter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="title">Trip name</label>
        <label className="bb-field">
          <span className="bb-field-icon"><FileText size={18} aria-hidden="true" /></span>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Spring black bear · Reyes party"
            className="bb-input bb-input-iconed"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="bb-form-row">
        <span className="bb-form-label">Activity</span>
        <div className="bb-segmented" role="radiogroup" aria-label="Activity">
          <label>
            <input type="radio" name="kind" value="hunting" defaultChecked />
            Hunting
          </label>
          <label>
            <input type="radio" name="kind" value="fishing" />
            Fishing
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="starts_at">Start</label>
          <label className="bb-field">
            <span className="bb-field-icon"><Calendar size={18} aria-hidden="true" /></span>
            <input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              required
              className="bb-input bb-input-iconed"
            />
          </label>
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="ends_at">End <span style={{ opacity: 0.6 }}>(optional)</span></label>
          <label className="bb-field">
            <span className="bb-field-icon"><Calendar size={18} aria-hidden="true" /></span>
            <input
              id="ends_at"
              name="ends_at"
              type="datetime-local"
              className="bb-input bb-input-iconed"
            />
          </label>
        </div>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="location_name">Location / unit</label>
        <label className="bb-field">
          <span className="bb-field-icon"><MapPin size={18} aria-hidden="true" /></span>
          <input
            id="location_name"
            name="location_name"
            type="text"
            placeholder="Mendocino · D6"
            className="bb-input bb-input-iconed"
            autoComplete="off"
          />
        </label>
        <p className="bb-form-help">Free text — we don&rsquo;t validate against state zones yet.</p>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="species_targeted">Species targeted <span style={{ opacity: 0.6 }}>(optional)</span></label>
        <label className="bb-field">
          <span className="bb-field-icon"><Target size={18} aria-hidden="true" /></span>
          <input
            id="species_targeted"
            name="species_targeted"
            type="text"
            placeholder="Black bear, wild pig"
            className="bb-input bb-input-iconed"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="bb-form-row">
        <span className="bb-form-label">
          <Users size={14} className="inline-block mr-1 align-text-bottom" aria-hidden="true" />
          Hunters
        </span>
        {hunters.length === 0 ? (
          <p className="bb-form-help">
            No accepted hunter invites yet. Send invites first — you&rsquo;ll be able to add hunters
            to the trip from the trip detail screen.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {hunters.map((h) => {
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
                    onChange={() => toggleHunter(h.id)}
                    className="h-4 w-4 accent-[color:var(--color-copper)]"
                  />
                  <span className="bb-avatar">{h.display_name.slice(0, 1).toUpperCase()}</span>
                  <span className="bb-detail-name">{h.display_name}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="notes">Notes <span style={{ opacity: 0.6 }}>(optional)</span></label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="bb-input"
          placeholder="Meet at the cabin trailhead 0530. Cold + clear forecast. Bring a layer."
        />
      </div>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Creating trip…' : 'Create trip'}
        </button>
      </div>
    </form>
  )
}
