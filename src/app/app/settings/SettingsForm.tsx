'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { updateGuideProfileAction, requestEmailChangeAction } from './actions'

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
  // Identity (profiles)
  first_name: string
  last_name: string
  phone: string
  // Address (profiles)
  address_street: string
  address_city: string
  address_state: string
  address_zip: string
  // Outfitter details (guide_profiles)
  business_name: string
  license_number: string
  max_party_size: number
  specialties: string[]
  bio: string
  // Account (read-only display)
  email: string
}

export default function SettingsForm({ initial }: { initial: Initial }) {
  // Identity
  const [firstName, setFirstName] = useState(initial.first_name)
  const [lastName, setLastName] = useState(initial.last_name)
  const [phone, setPhone] = useState(initial.phone)
  // Address
  const [addrStreet, setAddrStreet] = useState(initial.address_street)
  const [addrCity, setAddrCity] = useState(initial.address_city)
  const [addrState, setAddrState] = useState(initial.address_state)
  const [addrZip, setAddrZip] = useState(initial.address_zip)
  // Outfitter
  const [businessName, setBusinessName] = useState(initial.business_name)
  const [license, setLicense] = useState(initial.license_number)
  const [partySize, setPartySize] = useState(String(initial.max_party_size))
  const [bio, setBio] = useState(initial.bio)
  const [specs, setSpecs] = useState<Set<string>>(new Set(initial.specialties))

  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Change-email state
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [isEmailPending, startEmailTransition] = useTransition()

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
    fd.delete('specialties')
    specs.forEach((s) => fd.append('specialties', s))
    startTransition(async () => {
      const res = await updateGuideProfileAction(fd)
      if ('error' in res) setError(res.error)
      else setSavedAt(Date.now())
    })
  }

  function onSubmitEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailError(null)
    const fd = new FormData(e.currentTarget)
    startEmailTransition(async () => {
      const res = await requestEmailChangeAction(fd)
      if ('error' in res) {
        setEmailError(res.error)
      } else {
        setPendingEmail(res.pending_email)
        setEmailOpen(false)
        setNewEmail('')
        setConfirmEmail('')
      }
    })
  }

  const bioLeft = 280 - bio.length
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
            />
          </div>
        </div>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="business_name">Business name (optional)</label>
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
          <label className="bb-form-label" htmlFor="phone">Phone (optional)</label>
          <input
            id="phone"
            name="phone"
            className="bb-input"
            type="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
            autoComplete="tel"
          />
        </div>
      </fieldset>

      {/* Address */}
      <fieldset className="flex flex-col gap-4" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>Address</legend>

        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="address_street">Street (optional)</label>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="address_city">City (optional)</label>
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
            <label className="bb-form-label" htmlFor="address_state">State (optional)</label>
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
          <label className="bb-form-label" htmlFor="address_zip">ZIP (optional)</label>
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

      {/* Outfitter details */}
      <fieldset className="flex flex-col gap-4" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>Outfitter details</legend>

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
      </fieldset>

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

      {/* Account — sits outside the main save button so the email change is its own flow. */}
      <fieldset className="flex flex-col gap-3" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="bb-section-title" style={{ marginBottom: '0.25rem' }}>Account</legend>

        <div className="bb-form-row">
          <span className="bb-form-label">Current email</span>
          <p style={{ fontSize: '0.95rem' }}>{initial.email}</p>
        </div>

        {pendingEmail && (
          <div
            role="status"
            aria-live="polite"
            className="bb-tile"
            style={{ padding: '0.75rem 0.9rem', fontSize: '0.85rem' }}
          >
            Pending email change to {pendingEmail}. Check your inbox at {pendingEmail} to confirm.
            Until confirmed, you&rsquo;ll continue signing in with your current email.
          </div>
        )}

        {!emailOpen ? (
          <div>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={() => {
                setEmailOpen(true)
                setEmailError(null)
              }}
            >
              Change email
            </button>
          </div>
        ) : (
          // Nested form — submitting here does not submit the outer profile form.
          <div className="bb-tile" style={{ padding: '0.9rem' }}>
            <form onSubmit={onSubmitEmail} className="flex flex-col gap-3">
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="new_email">New email</label>
                <input
                  id="new_email"
                  name="new_email"
                  className="bb-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="confirm_email">Confirm new email</label>
                <input
                  id="confirm_email"
                  name="confirm_email"
                  className="bb-input"
                  type="email"
                  required
                  autoComplete="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                />
              </div>

              {emailError && (
                <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem' }}>
                  {emailError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button type="submit" className="bb-cta-sm" disabled={isEmailPending}>
                  {isEmailPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="bb-btn-secondary"
                  onClick={() => {
                    setEmailOpen(false)
                    setEmailError(null)
                    setNewEmail('')
                    setConfirmEmail('')
                  }}
                  disabled={isEmailPending}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </fieldset>
    </form>
  )
}
