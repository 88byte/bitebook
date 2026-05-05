import Link from 'next/link'
import {
  Building,
  FileText,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  PenLine,
} from 'lucide-react'
import { requireGuideForOnboarding } from '../_lib/auth'
import { fetchBiteBookTemplates } from '../_lib/docs-queries'
import { loadGuideDefaultSignatureDataUrl } from '../_lib/guide-default-signature'
import { US_STATES } from '@/lib/us-states'
import {
  saveBusinessBasicsAction,
  saveGuideLicenseAction,
  saveDefaultLogDocAction,
  finishOnboardingAction,
} from './actions'
import SignatureDefaultsForm from '../settings/SignatureDefaultsForm'

// v27.1.5.1 — guide first-time onboarding wizard.
// v27.5.0 — added Step 4 (Save signature) so warden share's auto-sign
// always has something to use. Old Step 4 (Done) shifts to Step 5.
//
// 5-step setup that runs once per guide. Triggered by requireGuide() when
// guide_profiles.onboarded_at IS NULL: any /app load bounces here until
// step 5 stamps onboarded_at = now() and falls back through.
//
//   Step 1 — Business basics      (required)
//   Step 2 — Guide license        (skippable)
//   Step 3 — State log doc        (skippable — links to /app/docs)
//   Step 4 — Save signature       (required for warden share)
//   Step 5 — Done                 (CTA stamps onboarded_at)
//
// Existing guides with business_name set were backfilled with
// onboarded_at = created_at by the v27.1.5.1 migration, so they never
// see this wizard.

type SearchParams = Promise<{ step?: string; error?: string; detail?: string }>

// v27.1.5.2: split the v27.1.5.1 single-banner ERROR_COPY into two layers.
// Per-field errors render INLINE under the relevant input — the user
// sees "State is required" right next to the dropdown, not a generic
// banner above. Genuine server failures (RLS / DB hiccups) still get
// the banner so the user knows the action didn't take.
const FIELD_ERROR: Record<string, { field: 'first_name' | 'last_name' | 'state' | 'license' | 'tag'; message: string }> = {
  missing_first_name: { field: 'first_name', message: 'First name is required.' },
  missing_last_name: { field: 'last_name', message: 'Last name is required.' },
  missing_state: { field: 'state', message: 'State is required.' },
  missing_fields: { field: 'license', message: 'Fill out every license field, or skip this step.' },
}
const BANNER_ERROR: Record<string, string> = {
  profile_save_failed: 'Couldn’t save your name. Please try again.',
  guide_save_failed: 'Couldn’t save business basics. Please try again.',
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
  const errorKey = params.error ?? null
  const fieldErrorEntry = errorKey ? FIELD_ERROR[errorKey] ?? null : null
  const bannerError = errorKey && !fieldErrorEntry ? (BANNER_ERROR[errorKey] ?? 'Something went wrong.') : null
  const fieldErrors = {
    first_name: fieldErrorEntry?.field === 'first_name' ? fieldErrorEntry.message : null,
    last_name: fieldErrorEntry?.field === 'last_name' ? fieldErrorEntry.message : null,
    state: fieldErrorEntry?.field === 'state' ? fieldErrorEntry.message : null,
    license: fieldErrorEntry?.field === 'license' ? fieldErrorEntry.message : null,
  }

  const { profile, guide } = await requireGuideForOnboarding()

  // v27.1.5.2.1: Step 3 inline templates picker. Fetch every Bite Book
  // template once on render; the picker filters to the guide's state on
  // the client (or shows the full list when state is null). Cheap query —
  // template list is small and RLS-cached. Other steps don't read it.
  const templates = stepNum === 3 ? await fetchBiteBookTemplates(profile.id) : []

  // v27.5.0 — Step 4 signature pad needs the existing default (if any) so
  // the pad pre-fills, plus a flag for whether the guide already saved
  // one (drives the Continue button visibility).
  const initialSignatureDataUrl =
    stepNum === 4 ? await loadGuideDefaultSignatureDataUrl(profile.id) : null
  const hasSavedSignature = !!guide?.default_signature_path

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

        <ProgressBar current={stepNum} total={5} />

        {bannerError && (
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
            {bannerError}
            {params.detail && (
              <span style={{ marginLeft: '0.4rem', fontStyle: 'italic', opacity: 0.8 }}>
                ({params.detail})
              </span>
            )}
          </div>
        )}

        {stepNum === 1 && (
          <Step1BusinessBasics
            initialFirstName={profile.first_name ?? ''}
            initialLastName={profile.last_name ?? ''}
            initialState={guide?.state ?? ''}
            initialBusinessName={guide?.business_name ?? ''}
            fieldErrors={fieldErrors}
          />
        )}
        {stepNum === 2 && (
          <Step2GuideLicense
            initialState={guide?.state ?? ''}
            licenseError={fieldErrors.license}
          />
        )}
        {stepNum === 3 && (
          <Step3StateLog
            templates={templates}
            guideState={guide?.state ?? null}
            currentDefaultDocId={guide?.default_log_doc_id ?? null}
          />
        )}
        {stepNum === 4 && (
          <Step4Signature
            initialDataURL={initialSignatureDataUrl}
            hasSaved={hasSavedSignature}
          />
        )}
        {stepNum === 5 && <Step5Done />}
      </div>
    </main>
  )
}

function clampStep(raw: string | undefined): 1 | 2 | 3 | 4 | 5 {
  const n = Number(raw)
  if (n === 2) return 2
  if (n === 3) return 3
  if (n === 4) return 4
  if (n === 5) return 5
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
  initialFirstName,
  initialLastName,
  initialState,
  initialBusinessName,
  fieldErrors,
}: {
  initialFirstName: string
  initialLastName: string
  initialState: string
  initialBusinessName: string
  fieldErrors: {
    first_name: string | null
    last_name: string | null
    state: string | null
  }
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
          Tell us about you
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          Used on hunter invites and state log auto-fill.
        </p>
        <form action={saveBusinessBasicsAction} className="flex flex-col gap-3">
          <div className="bb-form-grid-2">
            <label className="bb-field flex flex-col gap-1">
              <span className="bb-form-label">First name</span>
              <input
                type="text"
                name="first_name"
                autoComplete="given-name"
                required
                defaultValue={initialFirstName}
                className="bb-input"
                aria-invalid={!!fieldErrors.first_name}
              />
              <FieldError message={fieldErrors.first_name} />
            </label>
            <label className="bb-field flex flex-col gap-1">
              <span className="bb-form-label">Last name</span>
              <input
                type="text"
                name="last_name"
                autoComplete="family-name"
                required
                defaultValue={initialLastName}
                className="bb-input"
                aria-invalid={!!fieldErrors.last_name}
              />
              <FieldError message={fieldErrors.last_name} />
            </label>
          </div>
          <label className="bb-field flex flex-col gap-1">
            <span className="bb-form-label">State you operate in</span>
            <select
              name="state"
              required
              defaultValue={initialState}
              className="bb-input"
              aria-invalid={!!fieldErrors.state}
            >
              <option value="">Pick a state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.state} />
          </label>
          <label className="bb-field flex flex-col gap-1">
            <span
              className="bb-form-label"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Business name{' '}
              <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                (optional — only if you operate under a business)
              </span>
            </span>
            <input
              type="text"
              name="business_name"
              defaultValue={initialBusinessName}
              placeholder="e.g. Boulder Creek Outfitters"
              className="bb-input"
            />
          </label>
          <CtaSubmit label="Save and continue" />
        </form>
      </div>
    </section>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────

function Step2GuideLicense({
  initialState,
  licenseError,
}: {
  initialState: string
  licenseError: string | null
}) {
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
          <FieldError message={licenseError} />
          <FooterRow
            backToStep={1}
            skipToStep={3}
            skipLabel="Skip for now"
            primary={<CtaSubmit label="Save and continue" inline />}
          />
        </form>
      </div>
    </section>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────────────

type TemplateRow = {
  id: string
  label: string
  state: string | null
}

function Step3StateLog({
  templates,
  guideState,
  currentDefaultDocId,
}: {
  templates: TemplateRow[]
  guideState: string | null
  currentDefaultDocId: string | null
}) {
  // v27.1.5.2.2: state-filtered dropdown replaces the v27.1.5.2.1 stack
  // of radio cards. As the catalog of Bite Book templates grows the
  // radio list got long; a single <select> reads cleaner and matches
  // patterns used elsewhere in the app (NewTripForm species picker, etc).
  //
  // Filter rule: only show templates matching the guide's state. If the
  // guide somehow hasn't set a state (Step 1 enforces it, but be
  // defensive) we fall back to showing every template so the picker
  // isn't empty for no real reason.
  const stateMatched = guideState
    ? templates.filter((t) => t.state === guideState)
    : templates
  const hasMatches = stateMatched.length > 0

  // The "skip / upload later" sentinel is an empty string — the action
  // already treats '' as null so existing wiring stays intact.
  const SKIP_VALUE = ''

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
          Guides are required to submit trip logs for their hunters. Pick a
          Bite Book template for your state to use as your default — or
          upload your own if you prefer or if Bite Book doesn’t have one for
          your state.
        </p>

        <form action={saveDefaultLogDocAction} className="flex flex-col gap-3">
          <label className="bb-field flex flex-col gap-1">
            <span className="bb-form-label">Pick your default state harvest log</span>
            <select
              name="default_log_doc_id"
              defaultValue={currentDefaultDocId ?? ''}
              className="bb-input"
              required={false}
              aria-describedby={!hasMatches ? 'ob-step3-no-templates' : undefined}
            >
              <option value="" disabled>
                — Pick a template —
              </option>
              {hasMatches && (
                <optgroup label={`${guideState ?? 'Your state'} templates`}>
                  {stateMatched.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={SKIP_VALUE}>I’ll upload my own (skip for now)</option>
            </select>
            {!hasMatches && (
              <span
                id="ob-step3-no-templates"
                className="bb-form-help"
                style={{ marginTop: '0.15rem' }}
              >
                We don’t have a Bite Book template for{' '}
                {guideState ?? 'your state'} yet — upload yours from the
                docs library after you finish setup.
              </span>
            )}
          </label>

          <FooterRow
            backToStep={2}
            skipToStep={4}
            skipLabel="Skip for now"
            primary={<CtaSubmit label="Save default" inline />}
          />
        </form>
      </div>
    </section>
  )
}

// ── Step 4 — Save signature (v27.5.0) ─────────────────────────────────────
//
// Required step. The signature is what auto-signs hunt logs for warden
// share, so every onboarded guide leaves the wizard with one in hand.
// SignatureDefaultsForm calls saveDefaultSignatureAction (in
// settings/actions.ts) directly + router.refresh()'s on save; we re-render
// here, see hasSaved=true, and unhide the Continue button to advance to
// step 5. There's no skip path.

function Step4Signature({
  initialDataURL,
  hasSaved,
}: {
  initialDataURL: string | null
  hasSaved: boolean
}) {
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step4">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step4"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <PenLine size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Save your signature
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem' }}>
          We use this to auto-sign your hunt logs when you share with a warden in the field.
          You can re-draw it anytime from Settings.
        </p>
        <SignatureDefaultsForm initialDataURL={initialDataURL} hasSaved={hasSaved} />
        <FooterRow
          backToStep={3}
          primary={
            hasSaved ? (
              <Link
                href="/app/onboarding?step=5"
                className="bb-cta"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: 'auto',
                  paddingLeft: '1.25rem',
                  paddingRight: '1.25rem',
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="bb-cta"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: 'auto',
                  paddingLeft: '1.25rem',
                  paddingRight: '1.25rem',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            )
          }
        />
      </div>
    </section>
  )
}

// ── Step 5 — Done ─────────────────────────────────────────────────────────

function Step5Done() {
  return (
    <section className="bb-tile bb-form-section" aria-labelledby="ob-step5">
      <div className="bb-tile-body flex flex-col gap-3">
        <h2
          id="ob-step5"
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
          <FooterRow
            backToStep={4}
            primary={<CtaSubmit label="Take me to my dashboard" inline />}
          />
        </form>
      </div>
    </section>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────

// v27.1.5.2: explicit inline-flex layout on the wizard's primary CTA so the
// label + ArrowRight icon center as a unit and the icon sits to the RIGHT
// of the text. Without this, .bb-cta's default text-align: center on a
// width:100% button + the inline SVG icon was rendering with the icon
// floated oddly off to one side on certain viewports/browsers.
//
// `inline` mode shrinks the button to its content width — used in step
// 2/3/4 footer rows where the CTA shares a row with Back / Skip and
// shouldn't stretch across the full row.
function CtaSubmit({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <button
      type="submit"
      className={inline ? 'bb-cta' : 'bb-cta mt-1'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        ...(inline ? { width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' } : null),
      }}
    >
      <span>{label}</span>
      <ArrowRight size={14} aria-hidden="true" />
    </button>
  )
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <span
      role="alert"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.78rem',
        color: '#8C3C2A',
        marginTop: '0.15rem',
      }}
    >
      <AlertCircle size={12} aria-hidden="true" />
      {message}
    </span>
  )
}

function BackLink({ toStep }: { toStep: 1 | 2 | 3 | 4 }) {
  return (
    <Link
      href={`/app/onboarding?step=${toStep}`}
      className="bb-text-action bb-text-action-copper"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.85rem',
        // Match the bb-cta-sm height so the row reads as one unit instead
        // of three disconnected pieces.
        minHeight: '2.5rem',
      }}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </Link>
  )
}

// v27.1.5.2.1: Skip is a plain Link instead of a nested <form>. Inside
// Step 2's saveGuideLicenseAction <form>, a nested skip form is invalid
// HTML — browsers strip the inner form on parse, so clicking the inner
// submit button fired the OUTER action (saveGuideLicenseAction) and
// either failed validation or wrote a partial license. A Link sidesteps
// the issue entirely: it just navigates the URL, which the page re-reads
// to render the next step.
//
// Styled as a ghost copper secondary button (.bb-btn-secondary base +
// copper text + transparent bg) so the footer hierarchy reads as
// tertiary (Back text link) → secondary (Skip ghost button) → primary
// (Continue filled CTA).
function SkipLink({ next, label = 'Skip for now' }: { next: 2 | 3 | 4 | 5; label?: string }) {
  return (
    <Link
      href={`/app/onboarding?step=${next}`}
      className="bb-btn-secondary"
      style={{
        background: 'transparent',
        borderColor: 'rgba(176, 108, 60, 0.45)',
        color: 'var(--color-copper)',
        fontFamily: 'var(--font-barlow-condensed)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        fontSize: '0.78rem',
        minHeight: '2.5rem',
        padding: '0 0.95rem',
      }}
    >
      {label}
    </Link>
  )
}

// v27.1.5.2.1: shared footer row for Steps 2 / 3 / 4. Three slots:
//   left: Back text link (or empty spacer on Step 1)
//   middle: Skip ghost button (omitted when skipToStep is undefined —
//     used on Step 4 since "skip the dashboard" makes no sense)
//   right: Primary submit CTA
// Same height/padding scale across all three controls (minHeight 2.5rem)
// so the row reads as one tidy bar.
function FooterRow({
  backToStep,
  skipToStep,
  skipLabel,
  primary,
}: {
  backToStep?: 1 | 2 | 3 | 4
  skipToStep?: 2 | 3 | 4 | 5
  skipLabel?: string
  primary: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: '0.25rem',
      }}
    >
      {backToStep ? <BackLink toStep={backToStep} /> : null}
      <span style={{ flex: 1 }} />
      {skipToStep ? <SkipLink next={skipToStep} label={skipLabel} /> : null}
      {primary}
    </div>
  )
}

// v27.1.5.2.1: tileLinkStyle / tileBadgeStyle dropped — Step 3 no longer
// renders the redirect-out tile pair.
// v27.1.5.2.2: tileTitleStyle / tileSubStyle also dropped — Step 3 now
// uses a single <select> dropdown instead of stacked radio cards.
