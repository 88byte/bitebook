'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { updateHunterProfileAction } from './actions'

type Initial = {
  display_name: string
  phone: string
  avatar_url: string | null
}

export default function HunterProfileForm({ initial }: { initial: Initial }) {
  const [displayName, setDisplayName] = useState(initial.display_name)
  const [phone, setPhone] = useState(initial.phone)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateHunterProfileAction(fd)
      if ('error' in res) setError(res.error)
      else setSavedAt(Date.now())
    })
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 4000

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="display_name">Display name</label>
        <input
          id="display_name"
          name="display_name"
          className="bb-input"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          className="bb-input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={32}
          placeholder="Optional"
        />
        <p className="bb-form-help">Optional. Your guide can reach you here if shared.</p>
      </div>

      <div className="bb-form-row">
        <span className="bb-form-label">Avatar</span>
        <p className="bb-form-help">
          {initial.avatar_url
            ? 'Using your existing avatar. Custom upload arrives in v26.'
            : 'No avatar set. Custom upload arrives in v26.'}
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="bb-cta-sm" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save changes'}
        </button>
        {showSaved && (
          <span
            className="bb-pill bb-pill-active"
            role="status"
            aria-live="polite"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Check size={12} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
    </form>
  )
}
