'use client'

import { useState } from 'react'
import { Mail, User, Lock, Eye, EyeOff, Loader2, MapPin, FileText, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { US_STATES } from '@/lib/us-states'

// v27.1.5.0 — onboarding consolidation.
//
// Pre-v27.1.5, accept-invite captured ONLY display_name + password. The
// hunter then had to navigate /app/h → /app/h/wallet → add license → add
// tag → back to trip → tap each action card row to link. Five surfaces,
// drop-off everywhere.
//
// v27.1.5.0 collapses identity + address + license + (optional) tag into
// the same form. Wallet items are created on the spot. When the guide
// later adds the hunter to a trip, the trip detail's ActionNeededCard
// already auto-finds matching wallet items via fetchHunterMatchingWallet
// Items so the linkage feels automatic from the hunter's POV.
//
// Tag is opt-out — many hunters get the invite before tag draws come
// back, so the default is "I'll add my tag later" UNCHECKED (= section
// open) but they can flip it on if no tag yet.

type LicenseDraft = {
  identifier: string
  state: string
  issue_date: string
  valid_to: string
}

type TagDraft = {
  identifier: string
  species: string
  state: string
  zone: string
  season_year: string // string in form state, parsed to number on submit
  valid_to: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function endOfYearIso(): string {
  const y = new Date().getFullYear()
  return `${y}-12-31`
}

// v27.8.2.1 — `email` is now `string | null`. NULL means a link-mode
// invite (no email captured at create time); the form shows a writable
// email input and forwards that value to /api/accept-invite, which
// writes it back to the invitations row.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AcceptInviteForm({ token, email }: { token: string; email: string | null }) {
  const isLinkMode = email == null
  // Identity / auth
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Hunter-supplied email (only used in link mode).
  const [hunterEmail, setHunterEmail] = useState('')

  // Address
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [addrState, setAddrState] = useState('')
  const [zip, setZip] = useState('')

  // License (visible by default; "I'll add later" lets them skip)
  const [skipLicense, setSkipLicense] = useState(false)
  const [license, setLicense] = useState<LicenseDraft>({
    identifier: '',
    state: '',
    issue_date: todayIso(),
    valid_to: endOfYearIso(),
  })

  // Tag — section visible by default with empty fields. v27.8.1.1
  // (Flavio): the "add later" toggle now starts UNCHECKED so the
  // hunter has to actively opt in to skipping. Mirrors how License
  // already works. Earlier auto-checked behavior pre-skipped tag for
  // every hunter, which buried the form fields and meant guides who
  // do have a tag at invite time had to find the toggle to reveal it.
  const [skipTag, setSkipTag] = useState(false)
  const [tag, setTag] = useState<TagDraft>({
    identifier: '',
    species: '',
    state: '',
    zone: '',
    season_year: String(new Date().getFullYear()),
    valid_to: endOfYearIso(),
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Required: identity + password + address
    if (!firstName.trim()) return setError('Please enter your first name.')
    if (!lastName.trim()) return setError('Please enter your last name.')
    // v27.8.2.1 — link-mode invites: the hunter supplies their own email.
    if (isLinkMode) {
      if (!hunterEmail.trim()) return setError('Please enter your email.')
      if (!EMAIL_RX.test(hunterEmail.trim())) return setError('Please enter a valid email.')
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    if (!street.trim() || !city.trim() || !addrState || !zip.trim()) {
      return setError('Please fill in all address fields.')
    }

    // License — required fields if not skipped
    if (!skipLicense) {
      if (!license.identifier.trim()) {
        return setError('Enter your license number, or check "I’ll add my license later".')
      }
      if (!license.state) {
        return setError('Pick the state your license is from.')
      }
    }
    // Tag — required fields if not skipped
    if (!skipTag) {
      if (!tag.identifier.trim()) {
        return setError('Enter your tag number, or check "I’ll add my tag later".')
      }
      if (!tag.species.trim()) {
        return setError('Enter the species your tag is for, or skip it.')
      }
      if (!tag.state) {
        return setError('Pick the state your tag is from.')
      }
    }

    setLoading(true)
    const displayName = `${firstName.trim()} ${lastName.trim()}`
    const finalEmail = isLinkMode ? hunterEmail.trim().toLowerCase() : email!

    const res = await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        password,
        displayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        // v27.8.2.1 — link-mode invites send the hunter-supplied email so
        // the API can stamp it back onto invitations.email and use it
        // for createUser. Email-mode invites omit this field; the API
        // falls back to the locked invite.email.
        email: isLinkMode ? finalEmail : undefined,
        address: {
          street: street.trim(),
          city: city.trim(),
          state: addrState,
          zip: zip.trim(),
        },
        license: skipLicense
          ? null
          : {
              identifier: license.identifier.trim(),
              state: license.state,
              issue_date: license.issue_date || null,
              valid_to: license.valid_to,
            },
        tag: skipTag
          ? null
          : {
              identifier: tag.identifier.trim(),
              species: tag.species.trim(),
              state: tag.state,
              zone: tag.zone.trim() || null,
              season_year: tag.season_year ? Number(tag.season_year) : null,
              valid_to: tag.valid_to,
            },
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Something went wrong.' }))
      setLoading(false)
      setError(error || 'Something went wrong.')
      return
    }

    const supabase = createClient()
    // v27.8.2.1 — sign in with the email we submitted (locked for email-
    // mode, hunter-supplied for link-mode). `email` may be null here.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: finalEmail, password })
    if (signInErr) {
      setLoading(false)
      setError('Account created but sign-in failed. Try signing in from the home page.')
      return
    }
    window.location.assign('/app')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      {/* Account */}
      <Section title="Your account" icon={<User size={16} aria-hidden="true" />}>
        {/* v27.8.2.1 — email is readOnly when the guide locked it in
            (email-mode invite) and writable when the invite came via
            share-link (link-mode). The hunter is the source of truth in
            link mode; we write their email back to invitations.email
            and createUser uses it. */}
        <label className="bb-field">
          <span className="bb-field-icon"><Mail size={18} aria-hidden="true" /></span>
          {isLinkMode ? (
            <input
              type="email"
              autoComplete="email"
              required
              value={hunterEmail}
              onChange={(e) => setHunterEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="bb-input bb-input-iconed"
            />
          ) : (
            <input
              type="email"
              value={email ?? ''}
              readOnly
              aria-label="Email address"
              className="bb-input bb-input-iconed"
            />
          )}
        </label>
        <div className="bb-form-grid-2">
          <label className="bb-field">
            <input
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              aria-label="First name"
              className="bb-input"
            />
          </label>
          <label className="bb-field">
            <input
              type="text"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              aria-label="Last name"
              className="bb-input"
            />
          </label>
        </div>
        <label className="bb-field">
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            aria-label="Phone number"
            className="bb-input"
          />
        </label>
        <label className="bb-field">
          <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="bb-input bb-input-iconed bb-input-actioned"
          />
          <button
            type="button"
            className="bb-field-action"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </label>
        <label className="bb-field">
          <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            aria-label="Confirm password"
            className="bb-input bb-input-iconed"
          />
        </label>
      </Section>

      {/* Address */}
      <Section title="Mailing address" icon={<MapPin size={16} aria-hidden="true" />}>
        <p className="bb-form-help" style={{ margin: 0 }}>
          Used to fill state log fields. Required.
        </p>
        <label className="bb-field">
          <input
            type="text"
            autoComplete="street-address"
            required
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Street address"
            aria-label="Street address"
            className="bb-input"
          />
        </label>
        <div className="bb-form-grid-2">
          <label className="bb-field">
            <input
              type="text"
              autoComplete="address-level2"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
              className="bb-input"
            />
          </label>
          <label className="bb-field">
            <select
              required
              value={addrState}
              onChange={(e) => setAddrState(e.target.value)}
              aria-label="State"
              className="bb-input"
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="bb-field">
          <input
            type="text"
            autoComplete="postal-code"
            required
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="ZIP"
            aria-label="ZIP code"
            className="bb-input"
          />
        </label>
      </Section>

      {/* License */}
      <Section title="Hunting license" icon={<FileText size={16} aria-hidden="true" />}>
        <SkipToggle
          checked={skipLicense}
          onChange={setSkipLicense}
          label="I’ll add my license later"
        />
        {!skipLicense && (
          <>
            <div className="bb-form-grid-2">
              <label className="bb-field">
                <input
                  type="text"
                  required
                  value={license.identifier}
                  onChange={(e) => setLicense({ ...license, identifier: e.target.value })}
                  placeholder="License number"
                  aria-label="License number"
                  className="bb-input"
                />
              </label>
              <label className="bb-field">
                <select
                  required
                  value={license.state}
                  onChange={(e) => setLicense({ ...license, state: e.target.value })}
                  aria-label="License state"
                  className="bb-input"
                >
                  <option value="">State</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            {/* v27.8.1.1: stack-sm modifier — date inputs are full-width
                stacked below 640px (avoids iOS Safari date-input
                min-width overflowing the .bb-form-narrow container)
                and 50/50 grid at desktop. */}
            <div className="bb-form-grid-2-stack-sm">
              <label className="bb-field">
                <span className="bb-form-label">Issued</span>
                <input
                  type="date"
                  value={license.issue_date}
                  onChange={(e) => setLicense({ ...license, issue_date: e.target.value })}
                  aria-label="Issue date"
                  className="bb-input"
                />
              </label>
              <label className="bb-field">
                <span className="bb-form-label">Valid through</span>
                <input
                  type="date"
                  required
                  value={license.valid_to}
                  onChange={(e) => setLicense({ ...license, valid_to: e.target.value })}
                  aria-label="Valid through"
                  className="bb-input"
                />
              </label>
            </div>
          </>
        )}
      </Section>

      {/* Tag (default skipped) */}
      <Section title="Tag" icon={<Award size={16} aria-hidden="true" />}>
        <SkipToggle
          checked={skipTag}
          onChange={setSkipTag}
          label="I’ll add my tag later"
        />
        {!skipTag && (
          <>
            <div className="bb-form-grid-2">
              <label className="bb-field">
                <input
                  type="text"
                  required
                  value={tag.identifier}
                  onChange={(e) => setTag({ ...tag, identifier: e.target.value })}
                  placeholder="Tag number"
                  aria-label="Tag number"
                  className="bb-input"
                />
              </label>
              <label className="bb-field">
                <input
                  type="text"
                  required
                  value={tag.species}
                  onChange={(e) => setTag({ ...tag, species: e.target.value })}
                  placeholder="Species"
                  aria-label="Species"
                  className="bb-input"
                />
              </label>
            </div>
            <div className="bb-form-grid-2">
              <label className="bb-field">
                <select
                  required
                  value={tag.state}
                  onChange={(e) => setTag({ ...tag, state: e.target.value })}
                  aria-label="Tag state"
                  className="bb-input"
                >
                  <option value="">State</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="bb-field">
                <input
                  type="text"
                  value={tag.zone}
                  onChange={(e) => setTag({ ...tag, zone: e.target.value })}
                  placeholder="Zone (optional)"
                  aria-label="Tag zone"
                  className="bb-input"
                />
              </label>
            </div>
            <div className="bb-form-grid-2">
              <label className="bb-field">
                <span className="bb-form-label">Season year</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={tag.season_year}
                  onChange={(e) => setTag({ ...tag, season_year: e.target.value })}
                  aria-label="Season year"
                  className="bb-input"
                />
              </label>
              <label className="bb-field">
                <span className="bb-form-label">Valid through</span>
                <input
                  type="date"
                  required
                  value={tag.valid_to}
                  onChange={(e) => setTag({ ...tag, valid_to: e.target.value })}
                  aria-label="Valid through"
                  className="bb-input"
                />
              </label>
            </div>
          </>
        )}
      </Section>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <button type="submit" disabled={loading} className="bb-cta mt-1" aria-busy={loading}>
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={18} className="bb-spin" aria-hidden="true" />
            Setting up your account…
          </span>
        ) : (
          'Finish setup'
        )}
      </button>
    </form>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <fieldset
      style={{
        border: '1px solid var(--color-ink-tint)',
        borderRadius: 12,
        padding: '0.85rem 0.95rem 1rem',
        background: 'var(--color-paper)',
        margin: 0,
      }}
    >
      <legend
        style={{
          padding: '0 0.5rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '0.85rem',
          color: 'var(--color-copper)',
        }}
      >
        {icon}
        {title}
      </legend>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  )
}

function SkipToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        color: 'var(--color-ink-soft)',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
