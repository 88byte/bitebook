'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { updateGuideProfileAction } from './actions'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
] as const

const SPECIALTIES = [
  'Big game',
  'Waterfowl',
  'Upland',
  'Saltwater fish',
  'Freshwater fish',
  'Bow only',
  'Rifle',
  'Muzzleloader',
] as const

type Initial = {
  business_name: string
  state: string
  license_number: string
  max_party_size: number
  specialties: string[]
  bio: string
}

export default function SettingsForm({ initial }: { initial: Initial }) {
  const [businessName, setBusinessName] = useState(initial.business_name)
  const [stateVal, setStateVal] = useState(initial.state)
  const [license, setLicense] = useState(initial.license_number)
  const [partySize, setPartySize] = useState(String(initial.max_party_size))
  const [bio, setBio] = useState(initial.bio)
  const [specs, setSpecs] = useState<Set<string>>(new Set(initial.specialties))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleSpec(s: string) {
    setSpecs((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    // Replace specialties with the controlled set so the action sees the
    // current selection (not the stale checkbox DOM if any).
    fd.delete('specialties')
    specs.forEach((s) => fd.append('specialties', s))
    startTransition(async () => {
      const res = await updateGuideProfileAction(fd)
      if ('error' in res) setError(res.error)
      else setSavedAt(Date.now())
    })
  }

  const bioLeft = 280 - bio.length
  const showSaved = savedAt !== null && Date.now() - savedAt < 4000

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="business_name">Business name</label>
        <input
          id="business_name"
          name="business_name"
          className="bb-input"
          type="text"
          placeholder="Mountain Outfitters Co."
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="state">State</label>
        <select
          id="state"
          name="state"
          className="bb-input"
          value={stateVal}
          onChange={(e) => setStateVal(e.target.value)}
        >
          <option value="">Select a state</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="license_number">License number</label>
        <input
          id="license_number"
          name="license_number"
          className="bb-input"
          type="text"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          maxLength={64}
          placeholder="Optional"
        />
        <p className="bb-form-help">Optional. Used in warden share if filled.</p>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="max_party_size">Max party size</label>
        <input
          id="max_party_size"
          name="max_party_size"
          className="bb-input"
          type="number"
          min={1}
          max={12}
          value={partySize}
          onChange={(e) => setPartySize(e.target.value)}
        />
      </div>

      <div className="bb-form-row">
        <span className="bb-form-label">Specialties</span>
        <div className="bb-chip-row">
          {SPECIALTIES.map((s) => {
            const on = specs.has(s)
            return (
              <button
                type="button"
                key={s}
                onClick={() => toggleSpec(s)}
                className={`bb-chip ${on ? 'is-active' : ''}`}
                aria-pressed={on}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          name="bio"
          className="bb-input"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 280))}
          maxLength={280}
        />
        <p className="bb-form-help">{bioLeft} characters left</p>
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
