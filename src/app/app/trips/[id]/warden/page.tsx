import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, FileText, PenLine, Settings } from 'lucide-react'
import { requireGuide } from '../../../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  ensureLatestSetSigned,
  ensureSetSigned,
  type EnsureWardenSetResult,
} from '../../../_lib/warden-share'
import { ensureHarvestLog } from '../../../_lib/harvest-log-queries'
import { generateFilledHarvestLogPDFsAction } from '../../../_lib/harvest-log-fill'
import { loadGuideDefaultSignatureDataUrl } from '../../../_lib/guide-default-signature'
import SignatureDefaultsForm from '../../../settings/SignatureDefaultsForm'
import WardenView from './WardenView'

type RouteParams = Promise<{ id: string }>
type SearchParams = Promise<{ set?: string }>

// v27.5.0 — Warden Share. Renders the freshest signed harvest-log PDF
// set for the trip, full-screen, no app chrome. Auto-signs unsigned
// rows on entry using the guide's default signature, auto-generates a
// fresh fill if no logs exist yet.
//
// Failure modes (in order of likelihood):
//   - no_default_signature  → render SignatureDefaultsForm gate
//   - no_default_log_doc    → redirect to /app/settings?tab=defaults
//   - mapping_incomplete    → redirect to /app/docs/{docId}
//   - generate_failed       → render error tile with retry link
//
// Auth: requireGuide() + .eq('guide_id', guideId) on trip lookup.
export default async function WardenSharePage({
  params,
  searchParams,
}: {
  params: RouteParams
  searchParams: SearchParams
}) {
  const { id: tripId } = await params
  const { set: setKey } = await searchParams
  const { profile } = await requireGuide()

  const sb = await createClient()

  // Ownership + status guard. Wallet-grade defense: enforce guide_id on
  // the trip lookup — RLS already does this but belt-and-suspenders so
  // a hunter URL guess can't reach this view.
  const { data: trip } = await sb
    .from('trips')
    .select('id, guide_id, status')
    .eq('id', tripId)
    .eq('guide_id', profile.id)
    .maybeSingle()
  if (!trip) notFound()
  if (trip.status === 'canceled') {
    // No log can exist on a canceled trip; bounce back rather than
    // render an empty page. Trip detail still has a "Reopen trip" path.
    redirect(`/app/trips/${tripId}`)
  }

  // Default-signature gate. We render SignatureDefaultsForm inline; on
  // save it calls router.refresh() and this page re-runs with the path
  // populated.
  const defaultSig = await loadGuideDefaultSignatureDataUrl(profile.id)
  if (!defaultSig) {
    return <SignatureGate />
  }

  // Try the requested or latest set. ensureSetSigned handles both:
  // when setKey is provided, it picks that specific set; when omitted,
  // it falls back to ensureLatestSetSigned.
  let result: EnsureWardenSetResult = setKey
    ? await ensureSetSigned(tripId, profile.id, setKey)
    : await ensureLatestSetSigned(tripId, profile.id)

  // Auto-generate fallback when zero logs exist for the trip. We can't
  // do this for arbitrary set keys — only the no_logs case.
  if ('error' in result && result.error === 'no_logs') {
    const { data: guideRow } = await sb
      .from('guide_profiles')
      .select('default_log_doc_id')
      .eq('user_id', profile.id)
      .maybeSingle()
    const defaultDocId = guideRow?.default_log_doc_id ?? null
    if (!defaultDocId) {
      return (
        <ErrorGate
          tripId={tripId}
          headline="No default hunt log set up"
          body="Pick a state harvest log template in Settings before sharing with a warden. We use it to auto-fill the trip's data into the right state form."
          ctaLabel="Go to Settings"
          ctaHref="/app/settings?tab=defaults"
          ctaIcon="settings"
        />
      )
    }

    // Confirm the doc's mapping is at least partial (fill engine
    // requires it). If not, point them at the mapping wizard.
    const { data: docRow } = await sb
      .from('docs')
      .select('id, mapping_status')
      .eq('id', defaultDocId)
      .maybeSingle()
    if (!docRow || (docRow.mapping_status !== 'complete' && docRow.mapping_status !== 'partial')) {
      return (
        <ErrorGate
          tripId={tripId}
          headline="Hunt log mapping isn't finished"
          body="Your default state harvest log needs its field mapping completed before we can auto-fill it. It only takes a few minutes."
          ctaLabel="Finish mapping"
          ctaHref={`/app/docs/${defaultDocId}`}
          ctaIcon="filetext"
        />
      )
    }

    // Ensure a harvest_log row exists, then generate. ensureHarvestLog
    // handles the trip-status guard and creates the log row if needed.
    const ensured = await ensureHarvestLog(tripId, profile.id)
    if ('error' in ensured) {
      return (
        <ErrorGate
          tripId={tripId}
          headline="Couldn't open the hunt log"
          body={ensured.error}
        />
      )
    }
    const gen = await generateFilledHarvestLogPDFsAction(
      ensured.id,
      defaultDocId,
      undefined,
      undefined,
      true /* acknowledgeBlanks — warden flow can't pause for the soft warning */
    )
    if ('error' in gen) {
      return (
        <ErrorGate
          tripId={tripId}
          headline="Couldn't generate the hunt log"
          body={gen.error || 'Try again from the trip detail page.'}
        />
      )
    }
    // Re-run the ensure-signed step now that the row exists.
    result = await ensureLatestSetSigned(tripId, profile.id)
  }

  if ('error' in result) {
    if (result.error === 'no_default_signature') {
      // Defense in depth — should have been caught above.
      return <SignatureGate />
    }
    return (
      <ErrorGate
        tripId={tripId}
        headline="Couldn't open the warden share"
        body={result.detail || 'Try again from the trip detail page.'}
      />
    )
  }

  return (
    <WardenView
      tripId={tripId}
      setKey={result.set.set_key}
      rows={result.set.rows.map((r) => ({
        id: r.id,
        pass_index: r.pass_index,
        pass_total: r.pass_total,
        signed_url: r.signed_url,
      }))}
      allSets={result.allSets}
    />
  )
}

// ── Gates ──────────────────────────────────────────────────────────────

function SignatureGate() {
  return (
    <main className="bb-app-main">
      <div
        className="bb-tile bb-form-section"
        style={{ maxWidth: 480, margin: '2rem auto 4rem' }}
      >
        <div className="bb-tile-body">
          <h1
            className="bb-form-section-head"
            style={{ marginTop: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <PenLine size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
            Save your signature
          </h1>
          <p className="bb-form-help" style={{ margin: '0.4rem 0 1rem' }}>
            Wardens see signed hunt logs. Save your signature once and we&rsquo;ll auto-sign every
            warden share for you. You can re-draw it anytime from Settings.
          </p>
          <SignatureDefaultsForm initialDataURL={null} hasSaved={false} />
        </div>
      </div>
    </main>
  )
}

function ErrorGate({
  tripId,
  headline,
  body,
  ctaLabel,
  ctaHref,
  ctaIcon,
}: {
  tripId: string
  headline: string
  body: string
  ctaLabel?: string
  ctaHref?: string
  ctaIcon?: 'settings' | 'filetext'
}) {
  return (
    <main className="bb-app-main">
      <div className="bb-tile" style={{ maxWidth: 480, margin: '2rem auto', padding: '1.25rem' }}>
        <p
          className="bb-form-help"
          role="alert"
          style={{
            margin: 0,
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
            color: '#8C3C2A',
            background: 'rgba(163, 61, 61, 0.06)',
            borderRadius: 8,
            padding: '0.7rem 0.85rem',
            marginBottom: '0.75rem',
          }}
        >
          <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>{headline}.</strong> {body}
          </span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="bb-cta-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              {ctaIcon === 'settings' && <Settings size={14} aria-hidden="true" />}
              {ctaIcon === 'filetext' && <FileText size={14} aria-hidden="true" />}
              {ctaLabel}
            </Link>
          )}
          <Link
            href={`/app/trips/${tripId}`}
            className="bb-text-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to trip
          </Link>
        </div>
      </div>
    </main>
  )
}
