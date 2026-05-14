'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Upload, Check, X } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import {
  uploadOutfitterLogoAction,
  createOutfitterCheckoutAction,
  bypassOutfitterCheckoutForTesting,
} from './actions'

// v28.1.0b — 4-step outfitter upgrade wizard. All state lives in this
// client component. Step transitions are local; only Step 4 hits the
// server to create the Stripe Checkout session. Logo upload happens
// at Step 2 to a temp path; webhook moves to {org_id}/ on success.
export default function OutfitterUpgradeWizard({
  userEmail,
  canceled,
  testBypassAllowed = false,
}: {
  userEmail: string | null
  canceled: boolean
  testBypassAllowed?: boolean
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step 1: org info
  const [orgName, setOrgName] = useState('')
  const [state, setState] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')

  // Step 2: logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [tempLogoPath, setTempLogoPath] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  // Step 3: pricing
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [keepGuideSub, setKeepGuideSub] = useState(true)

  function validateStep1(): string | null {
    if (orgName.trim().length < 2) return 'Org name must be at least 2 characters.'
    if (orgName.trim().length > 80) return 'Org name must be 80 characters or fewer.'
    // v28.1.0b.3 — Outfitter license # is required (state agencies tie
    // outfitter operations to a state-issued permit; a guide who has no
    // commercial license isn't an outfitter).
    if (licenseNumber.trim().length < 1) return 'Outfitter license number is required to upgrade.'
    return null
  }

  function pickLogo(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (!f) return
    setLogoFile(f)
    setLogoPreview(URL.createObjectURL(f))
    setError(null)
    // Upload immediately so step transition is fast.
    setLogoUploading(true)
    const fd = new FormData()
    fd.append('file', f)
    uploadOutfitterLogoAction(fd)
      .then((res) => {
        if ('error' in res) {
          setError(res.error)
          setLogoFile(null)
          setLogoPreview(null)
        } else {
          setTempLogoPath(res.temp_path)
        }
      })
      .finally(() => setLogoUploading(false))
  }

  function clearLogo() {
    setLogoFile(null)
    setLogoPreview(null)
    setTempLogoPath(null)
  }

  function goToCheckout() {
    setError(null)
    startTransition(async () => {
      const res = await createOutfitterCheckoutAction({
        org_name: orgName.trim(),
        state: state || null,
        outfitter_license_number: licenseNumber.trim() || null,
        business_address: businessAddress.trim() || null,
        temp_logo_path: tempLogoPath,
        interval,
        keep_guide_sub: keepGuideSub,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      window.location.href = res.url
    })
  }

  // v28.1.0b.1 — Admin test-bypass. Only renders for allowlisted users
  // (Flavio + OUTFITTER_TEST_ALLOWLIST). Server-side action ALSO checks
  // the allowlist, so a non-allowlisted user calling this directly
  // gets rejected.
  function runTestBypass() {
    setError(null)
    if (!window.confirm('Skip payment and create a comp outfitter org for testing? This org will be flagged is_test=true and wiped before public launch.')) {
      return
    }
    startTransition(async () => {
      const res = await bypassOutfitterCheckoutForTesting({
        org_name: orgName.trim(),
        state: state || null,
        outfitter_license_number: licenseNumber.trim() || null,
        business_address: businessAddress.trim() || null,
        temp_logo_path: tempLogoPath,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      window.location.href = '/app/upgrade-success?test_bypass=1'
    })
  }

  return (
    <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: 'var(--color-copper)', marginBottom: '0.5rem' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to settings
      </Link>
      <header>
        <p className="bb-page-eyebrow">Upgrade</p>
        <h1 className="bb-page-title">Become an outfitter</h1>
        <p className="bb-page-sub">
          Add admin seats, build a guide network, and assign trips across your team.
        </p>
      </header>

      {canceled && (
        <div
          className="bb-tile"
          role="status"
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(168, 92, 50, 0.08)',
            borderColor: 'var(--color-copper)',
          }}
        >
          Checkout was canceled. You can pick back up here.
        </div>
      )}

      {/* Step progress */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '1rem 0 1.25rem',
          fontSize: '0.85rem',
          color: 'var(--color-ink-soft)',
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.6rem',
              borderRadius: 999,
              background: step === n ? 'var(--color-copper)' : 'transparent',
              color: step === n ? '#FFFFFF' : step > n ? 'var(--color-copper)' : 'var(--color-ink-muted)',
              border: '1px solid',
              borderColor: step >= n ? 'var(--color-copper)' : 'rgba(31,36,25,0.18)',
              fontWeight: 600,
            }}
          >
            {step > n ? <Check size={12} aria-hidden="true" /> : n}
            {n === 1 ? 'Org' : n === 2 ? 'Logo' : n === 3 ? 'Plan' : 'Pay'}
          </span>
        ))}
      </div>

      {error && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}

      {/* STEP 1 — Org info */}
      {step === 1 && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Org info</h2>
            <div className="bb-form-row" style={{ marginTop: '0.5rem' }}>
              <label className="bb-form-label" htmlFor="org_name">Org name</label>
              <input
                id="org_name"
                type="text"
                className="bb-input"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Last Bite Pro Outfitters"
                autoComplete="off"
                maxLength={80}
              />
            </div>
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="state">State <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <select id="state" className="bb-input" value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="license">Outfitter license # <span aria-hidden="true" style={{ color: 'var(--color-copper)' }}>*</span></label>
                <input
                  id="license"
                  type="text"
                  className="bb-input"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. CA-OUT-1234"
                  autoComplete="off"
                  maxLength={120}
                />
              </div>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="address">Business address <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="address"
                type="text"
                className="bb-input"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="123 Mountain Rd, Redding CA"
                autoComplete="off"
                maxLength={240}
              />
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="bb-cta-sm"
                onClick={() => {
                  const err = validateStep1()
                  if (err) { setError(err); return }
                  setError(null)
                  setStep(2)
                }}
              >
                Next: Logo
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 2 — Logo */}
      {step === 2 && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Logo (optional)</h2>
            <p className="bb-form-help" style={{ marginBottom: '0.6rem' }}>
              PNG, JPEG, WebP, or SVG. Max 2 MB. You can add or change this later from settings.
            </p>
            {logoPreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem',
                  borderRadius: 8,
                  border: '1px solid rgba(31,36,25,0.18)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 6 }}
                />
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{logoFile?.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>
                    {logoUploading ? 'Uploading…' : tempLogoPath ? 'Uploaded' : 'Ready'}
                  </div>
                </div>
                <button
                  type="button"
                  className="bb-btn-secondary"
                  onClick={clearLogo}
                  disabled={logoUploading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <X size={14} aria-hidden="true" /> Remove
                </button>
              </div>
            ) : (
              <label
                className="bb-btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                }}
              >
                <Upload size={14} aria-hidden="true" />
                Pick a logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={pickLogo}
                  style={{ display: 'none' }}
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="bb-btn-secondary"
                onClick={() => { setError(null); setStep(1) }}
              >
                Back
              </button>
              <button
                type="button"
                className="bb-cta-sm"
                onClick={() => { setError(null); setStep(3) }}
                disabled={logoUploading}
              >
                {logoFile ? 'Next: Plan' : 'Skip · Next: Plan'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3 — Pricing */}
      {step === 3 && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Pick a plan</h2>
            <div className="bb-form-grid-2" style={{ marginTop: '0.5rem' }}>
              {(['month', 'year'] as const).map((iv) => {
                const isActive = interval === iv
                const price = iv === 'month' ? '$39' : '$390'
                const suffix = iv === 'month' ? '/mo' : '/yr'
                const subline = iv === 'month' ? 'Billed monthly' : 'Save $78 vs monthly'
                return (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setInterval(iv)}
                    className="bb-tile"
                    style={{
                      padding: '0.85rem 1rem',
                      textAlign: 'left',
                      borderColor: isActive ? 'var(--color-copper)' : undefined,
                      background: isActive ? 'rgba(168, 92, 50, 0.06)' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-barlow-condensed)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                      {price}<span style={{ fontSize: '1rem', color: 'var(--color-ink-soft)' }}>{suffix}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>{subline}</div>
                  </button>
                )
              })}
            </div>
            <p className="bb-form-help" style={{ marginTop: '0.75rem' }}>
              <strong>7-day trial.</strong> Card collected at signup, no charge until trial ends. Cancel anytime.
            </p>
            <ul style={{ fontSize: '0.9rem', color: 'var(--color-ink-soft)', marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
              <li>3 admin seats (owner + 2 admins)</li>
              <li>Unlimited network guides (each pays their own $90/yr guide sub)</li>
              <li>Unlimited hunters</li>
              <li>Multi-guide trip assignment + calendar</li>
              <li>Log-on-behalf with audit trail</li>
              <li>Reviews of your outfit + your guides</li>
            </ul>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.55rem',
                marginTop: '1rem',
                fontSize: '0.9rem',
                color: 'var(--color-ink)',
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={keepGuideSub}
                onChange={(e) => setKeepGuideSub(e.target.checked)}
                style={{
                  width: '1.05rem',
                  height: '1.05rem',
                  marginTop: '0.15rem',
                  accentColor: 'var(--color-copper)',
                  flexShrink: 0,
                }}
              />
              <span>
                <strong>Keep my guide subscription active</strong>
                <span style={{ color: 'var(--color-ink-soft)' }}>
                  {' '}— if you also plan to lead trips yourself. You&rsquo;ll have both subscriptions: outfitter for org management, guide for being assigned as a lead.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="bb-btn-secondary"
                onClick={() => { setError(null); setStep(2) }}
              >
                Back
              </button>
              <button
                type="button"
                className="bb-cta-sm"
                onClick={() => { setError(null); setStep(4) }}
              >
                Next: Review
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEP 4 — Review + Stripe Checkout */}
      {step === 4 && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Review &amp; pay</h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Building2 size={20} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{orgName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
                    {[state, licenseNumber, businessAddress].filter(Boolean).join(' · ') || 'No additional details'}
                  </div>
                </div>
              </div>
              <div className="bb-form-help" style={{ marginTop: '0.25rem' }}>
                Plan: <strong>{interval === 'month' ? '$39/mo' : '$390/yr'}</strong> · 7-day trial · {keepGuideSub ? 'Keeping guide sub' : 'Guide sub will cancel at period end'}
                {logoFile ? ' · Logo attached' : ''}
              </div>
              <p className="bb-form-help">
                You&rsquo;ll be redirected to Stripe to enter your card. No charge until the trial ends.
              </p>
              {userEmail && (
                <p className="bb-form-help" style={{ fontSize: '0.8rem' }}>
                  Receipts to: <strong>{userEmail}</strong>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="bb-btn-secondary"
                onClick={() => { setError(null); setStep(3) }}
                disabled={pending}
              >
                Back
              </button>
              <button
                type="button"
                className="bb-cta-sm"
                onClick={goToCheckout}
                disabled={pending || logoUploading}
              >
                {pending ? 'Loading Stripe…' : logoUploading ? 'Uploading logo…' : 'Start 7-day trial'}
              </button>
            </div>
            {logoUploading && (
              <p className="bb-form-help" style={{ marginTop: '0.5rem', color: 'var(--color-copper)' }}>
                Finishing logo upload before checkout…
              </p>
            )}

            {/* v28.1.0b.1 — Admin test-bypass. Unobtrusive link under the
                main CTA, only rendered for allowlisted users (Flavio +
                OUTFITTER_TEST_ALLOWLIST). Server-side check enforced. */}
            {testBypassAllowed && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--color-ink-muted)' }}>
                <button
                  type="button"
                  onClick={runTestBypass}
                  disabled={pending || logoUploading}
                  className="bb-text-action"
                  style={{ display: 'inline', padding: 0, textDecoration: 'underline', color: 'var(--color-ink-muted)' }}
                >
                  Skip payment (test mode)
                </button>
                <span style={{ marginLeft: '0.4rem' }}>
                  — admin only. Creates a comp org flagged is_test=true.
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
