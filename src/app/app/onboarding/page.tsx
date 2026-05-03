import Link from 'next/link'
import {
  Building,
  FileText,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react'
import { requireGuideForOnboarding } from '../_lib/auth'
import { US_STATES } from '@/lib/us-states'
import {
  saveBusinessBasicsAction,
  saveGuideLicenseAction,
  skipToStepAction,
  finishOnboardingAction,
} from './actions'

// v27.1.5.1 — guide first-time onboarding wizard.
//
// 4-step setup that runs once per guide. Triggered by requireGuide() when
// guide_profiles.onboarded_at IS NULL: any /app load bounces here until
// step 4 stamps onboarded_at = now() and falls back through.
//
//   Step 1 — Business basics      (required)
//   Step 2 — Guide license        (skippable)
//   Step 3 — State log doc        (skippable — links to /app/docs)
//   Step 4 — Done                 (CTA stamps onboarded_at)
//
// Existing guides with business_name set were backfilled with
// onboarded_at = created_at by the v27.1.5.1 migration, so they never
// see this wizard.

type SearchParams = Promise<{ step?: string; error?: string }>

const ERROR_COPY: Record<string, string> = {
  missing_business_name: 'Enter your business name to continue.',
  missing_state: 'Pick the state you primarily operate in.',
  missing_fields: 'Fill out every license field, or skip this step.',
  save_failed: 'Couldn’t save. Please try again.',
  finish_failed: 'Couldn’t finalize setup. Please try again.',
}

export default async function GuideOnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const stepNum = clampStep(params.step)
  const errorMsg = params.error ? (ERROR_COPY[params.error] ?? 'Something went wrong.') : null

  const { profile, guide } = await requireGuideForOnboarding()

  return (
    <main className="bb-app-main">
      <div className="bb-form-narrow flex flex-col gap-4">
        <header>
          <p className="bb-page-eyebrow">Get set up</p>
          <h1 className="bb-page-title">Welcome, {profile.display_name}</h1>
          <p className="bb-page-sub">
            Four quick steps and you’re ready to invite hunters.
          </p>
        </header>

        <ProgressBar current={stepNum} total={4} />

        {errorMsg && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 8,
              background: '#F2D6CE',
              color: '#8C3C2A',
              fontSize: '0.85rem',
            }}
          >
            <AlertCircle size={16} aria-hidden="true" />
            {errorMsg}
          </div>
        )}

        {stepNum === 1 && (
          <Step1BusinessBasics
            initialBusinessName={guide?.business_name ?? ''}
            initialState={guide?.state ?? ''}
          />
        )}
        {stepNum === 2 && <Step2GuideLicense initialState={guide?.state ?? ''} />}
        {stepNum === 3 && <Step3StateLog />}
        {stepNum === 4 && <Step4Done />}
      </div>
    </main>
  )
}

function clampStep(raw: string | undefined): 1 | 2 | 3 | 4 {
  const n = Number(raw)
  if (n === 2) return 2
  if (n === 3) return 3
  if (n === 4) return 4
  return 1
}

// ── Progress indicator ────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '0.78rem',
          color: 'var(--color-ink-muted)',
        }}
      >
        Step {current} of {total}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '0.3rem',
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const idx = i + 1
          const filled = idx <= current
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 999,
                background: filled ? 'var(--color-copper)' : 'var(--color-ink-tint)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Step 1 ────────────────────────────────────────────────────────────────

function Step1BusinessBasics({
  initialBusinessName,
  initialState,
}: {
  initialBusinessName: string
  initialState: string
}) {
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step1">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step1"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Building size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Business basics
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          Required. Used on hunter invites and state log auto-fill.
        </p>
        <form action={saveBusinessBasicsAction} className="flex flex-col gap-3">
          <label className="bb-field flex flex-col gap-1">
            <span className="bb-form-label">Business name</span>
            <input
              type="text"
              name="business_name"
              required
              defaultValue={initialBusinessName}
              placeholder="e.g. Boulder Creek Outfitters"
              className="bb-input"
            />
          </label>
          <label className="bb-field flex flex-col gap-1">
            <span className="bb-form-label">State of operation</span>
            <select
              name="state"
              required
              defaultValue={initialState}
              className="bb-input"
            >
              <option value="">Pick a state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="bb-cta mt-1">
            Save and continue <ArrowRight size={14} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────

function Step2GuideLicense({ initialState }: { initialState: string }) {
  const yearEnd = `${new Date().getFullYear()}-12-31`
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step2">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step2"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <FileText size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Guide license
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          We add this to your wallet so it’s ready when state logs need it.
        </p>
        <form action={saveGuideLicenseAction} className="flex flex-col gap-3">
          <div className="bb-form-grid-2">
            <label className="bb-field flex flex-col gap-1">
              <span className="bb-form-label">License number</span>
              <input
                type="text"
                name="identifier"
                required
                placeholder="e.g. G12345"
                className="bb-input"
              />
            </label>
            <label className="bb-field flex flex-col gap-1">
              <span className="bb-form-label">Issuing state</span>
              <select
                name="state"
                required
                defaultValue={initialState}
                className="bb-input"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="bb-field flex flex-col gap-1">
            <span className="bb-form-label">Expiration date</span>
            <input
              type="date"
              name="valid_to"
              required
              defaultValue={yearEnd}
              className="bb-input"
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <BackLink toStep={1} />
            <span style={{ flex: 1 }} />
            <SkipForm next={3} />
            <button type="submit" className="bb-cta">
              Save and continue <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────────────

function Step3StateLog() {
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step3">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step3"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Upload size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          State harvest log
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          Pick a Bite Book template for your state, or upload your own PDF.
          Either way the auto-fill engine handles the rest.
        </p>

        <div className="bb-form-grid-2">
          <Link href="/app/docs?tab=templates" className="bb-tile" style={tileLinkStyle}>
            <span style={tileBadgeStyle}>Templates</span>
            <span style={tileTitleStyle}>Use a Bite Book template</span>
            <span style={tileSubStyle}>
              Pre-mapped state forms — pick yours and you’re done.
            </span>
          </Link>
          <Link href="/app/docs" className="bb-tile" style={tileLinkStyle}>
            <span style={tileBadgeStyle}>Upload</span>
            <span style={tileTitleStyle}>Upload your own state log</span>
            <span style={tileSubStyle}>
              We’ll auto-suggest the field mappings from the PDF.
            </span>
          </Link>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <BackLink toStep={2} />
          <span style={{ flex: 1 }} />
          <SkipForm next={4} label="Skip and finish" />
          <form
            action={skipToStepAction}
            style={{ display: 'inline-flex' }}
          >
            <input type="hidden" name="next" value="4" />
            <button type="submit" className="bb-cta">
              Continue <ArrowRight size={14} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

// ── Step 4 ────────────────────────────────────────────────────────────────

function Step4Done() {
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step4">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step4"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <CheckCircle2 size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          You’re ready to roll
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          Hit the button below and we’ll drop you on the dashboard.
          You can revisit any of these from Settings or the wallet later.
        </p>
        <form action={finishOnboardingAction}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <BackLink toStep={3} />
            <span style={{ flex: 1 }} />
            <button type="submit" className="bb-cta">
              Take me to my dashboard <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────

function BackLink({ toStep }: { toStep: 1 | 2 | 3 }) {
  return (
    <Link
      href={`/app/onboarding?step=${toStep}`}
      className="bb-text-action bb-text-action-copper"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.85rem',
      }}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </Link>
  )
}

function SkipForm({ next, label = 'Skip for now' }: { next: 2 | 3 | 4; label?: string }) {
  return (
    <form action={skipToStepAction} style={{ display: 'inline-flex' }}>
      <input type="hidden" name="next" value={String(next)} />
      <button
        type="submit"
        className="bb-text-action bb-text-action-copper"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </form>
  )
}

const tileLinkStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.85rem 0.95rem',
  borderColor: 'var(--color-ink-tint)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'inherit',
}

const tileBadgeStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.15rem 0.45rem',
  borderRadius: 999,
  background: 'var(--color-copper)',
  color: '#fff',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const tileTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: 'var(--color-ink)',
}

const tileSubStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--color-ink-soft)',
}
