'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { updateHunterProfileAction } from './actions'

type Initial = {
  // Identity (profiles)
  display_name: string
  first_name: string
  last_name: string
  phone: string
  // Address (profiles)
  address_street: string
  // v27.1.1.0.2: optional second line (apt / suite / unit)
  address_street2: string
  address_city: string
  address_state: string
  address_zip: string
  // License (profiles)
  license_doc_id: string
  // Read-only display
  avatar_url: string | null
}

// v26.0 Batch A: hunter profile form expanded to capture address + state
// hunter license number. These power the hunter onboarding `profile_set`
// step (all required fields must be present) and feed Batch C's state
// hunter log auto-fill.
export default function HunterProfileForm({ initial }: { initial: Initial }) {
  // Identity
  const [firstName, setFirstName] = useState(initial.first_name)
  const [lastName, setLastName] = useState(initial.last_name)
  const [displayName, setDisplayName] = useState(initial.display_name)
  const [phone, setPhone] = useState(initial.phone)
  // Address
  const [addrStreet, setAddrStreet] = useState(initial.address_street)
  const [addrStreet2, setAddrStreet2] = useState(initial.address_street2)
  const [addrCity, setAddrCity] = useState(initial.address_city)
  const [addrState, setAddrState] = useState(initial.address_state)
  const [addrZip, setAddrZip] = useState(initial.address_zip)
  // License
  const [licenseDocId, setLicenseDocId] = useState(initial.license_doc_id)

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
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Identity */}
      <fieldset className="flex flex-col gap-4" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>Identity</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="first_name">First name</label>
            <input
              id="first_name"
              name="first_name"
              className="bb-input"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={80}
              autoComplete="given-name"
            />
          </div>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="last_name">Last name</label>
            <input
              id="last_name"
              name="last_name"
              className="bb-input"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={80}
              autoComplete="family-name"
            />
          </div>
        </div>

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
          <p className="bb-form-help">What your guide sees on shared trips.</p>
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
            autoComplete="tel"
          />
          <p className="bb-form-help">Optional. Your guide can reach you here if shared.</p>
        </div>
      </fieldset>

      {/* Address */}
      <fieldset className="flex flex-col gap-4" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>Address</legend>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="address_street">Street</label>
          <input
            id="address_street"
            name="address_street"
            className="bb-input"
            type="text"
            placeholder="123 Main St"
            value={addrStreet}
            onChange={(e) => setAddrStreet(e.target.value)}
            maxLength={160}
            autoComplete="street-address"
          />
        </div>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="address_street2">
            Apt / suite / unit <span style={{ opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            id="address_street2"
            name="address_street2"
            className="bb-input"
            type="text"
            placeholder="Apt 4B"
            value={addrStreet2}
            onChange={(e) => setAddrStreet2(e.target.value)}
            maxLength={80}
            autoComplete="address-line2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="address_city">City</label>
            <input
              id="address_city"
              name="address_city"
              className="bb-input"
              type="text"
              value={addrCity}
              onChange={(e) => setAddrCity(e.target.value)}
              maxLength={80}
              autoComplete="address-level2"
            />
          </div>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="address_state">State</label>
            <select
              id="address_state"
              name="address_state"
              className="bb-input"
              value={addrState}
              onChange={(e) => setAddrState(e.target.value)}
              autoComplete="address-level1"
            >
              <option value="">Select a state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="address_zip">ZIP</label>
          <input
            id="address_zip"
            name="address_zip"
            className="bb-input"
            type="text"
            value={addrZip}
            onChange={(e) => setAddrZip(e.target.value)}
            maxLength={10}
            autoComplete="postal-code"
            placeholder="94101"
          />
        </div>
      </fieldset>

      {/* License */}
      <fieldset className="flex flex-col gap-4" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>License</legend>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="license_doc_id">State hunter license #</label>
          <input
            id="license_doc_id"
            name="license_doc_id"
            className="bb-input"
            type="text"
            value={licenseDocId}
            onChange={(e) => setLicenseDocId(e.target.value)}
            maxLength={64}
            placeholder="D1234567"
          />
          <p className="bb-form-help">Usually a D-prefixed code, e.g., D1234567.</p>
        </div>
      </fieldset>

      {/* Avatar (still placeholder) */}
      <div className="bb-form-row">
        <span className="bb-form-label">Avatar</span>
        <p className="bb-form-help">
          {initial.avatar_url
            ? 'Using your existing avatar. Custom upload arrives in a later release.'
            : 'No avatar set. Custom upload arrives in a later release.'}
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
