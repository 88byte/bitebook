import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../../_lib/auth'
import { fetchTripDetail, fetchSpecies } from '../../../_lib/queries'
import {
  fetchHarvestLog,
  ensureHarvestLog,
  fetchMappedLogDocs,
  fetchTripGeneratedLogs,
} from '../../../_lib/harvest-log-queries'
import { loadGuideDefaultSignatureDataUrl } from '../../../_lib/guide-default-signature'
import HarvestLogEditor from './HarvestLogEditor'

type Params = Promise<{ id: string }>

// v27.1.1.0.3a — guide-side hunt report editor.
// If the trip has no harvest_log yet, we generate it idempotently here
// (one log row + one entry per participant, with license + tag + phone +
// address auto-filled from trip_wallet_items + profile). Then render the
// accordion editor.
//
// PDF generation + Generate Filled PDFs button ship in v27.1.1.0.3b.
export default async function TripHarvestLogPage({ params }: { params: Params }) {
  const { profile } = await requireGuide()
  const { id: tripId } = await params

  const detail = await fetchTripDetail(profile.id, tripId)
  if (!detail) notFound()
  const trip = detail.trip

  // v27.1.1.0.3a.1: ensure-or-create via a plain async helper (NOT a
  // server action) so revalidatePath isn't fired from inside this render.
  // The previous v27.1.1.0.3a flow called generateHarvestLogAction here,
  // and Next.js can't reconcile a revalidate fired during a render pass —
  // first visit briefly flashed the error boundary before the page
  // resolved. ensureHarvestLog does the same insert work without the
  // revalidate, so the render is clean.
  //
  // v27.9.7.5 — call ensureHarvestLog on EVERY render, not just when the
  // log row is missing. The function is now insert-only and idempotent:
  // it finds-or-creates the log row + adds entries for any participants
  // who don't yet have one. Pre-v27.9.7.5 the page early-returned the
  // existing log without re-checking entries, so a hunter added AFTER
  // the first /log visit never got a row in the editor.
  const ensureRes = await ensureHarvestLog(tripId, profile.id)
  if ('error' in ensureRes) {
    return (
      <main className="bb-app-main">
        <div className="mb-3">
          <Link
            href={`/app/trips/${tripId}`}
            className="bb-text-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to trip
          </Link>
        </div>
        <header>
          <h1 className="bb-page-title">Hunt report</h1>
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
            Could not generate the hunt report: {ensureRes.error}
          </p>
        </header>
      </main>
    )
  }
  const log = await fetchHarvestLog(tripId)
  if (!log) redirect(`/app/trips/${tripId}`)

  // v27.1.1.0.3b: fetch mapped log docs for the Generate PDF picker.
  // v27.1.1.0.3e.3: also fetch the trip's generated PDF history.
  // v27.3.7.1 item 3: also fetch the species pool so the per-hunter
  // species rows can use the same SpeciesField dropdown the trip
  // form uses (consistency + default to trip species).
  const [mappedDocs, generatedLogs, speciesOptions, defaultSignatureDataUrl] = await Promise.all([
    fetchMappedLogDocs(profile.id),
    fetchTripGeneratedLogs(tripId),
    fetchSpecies(),
    // v27.4.0 — pre-fetch the guide's saved default signature so the
    // SignModal pre-fills with it when opened.
    loadGuideDefaultSignatureDataUrl(profile.id),
  ])

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href={`/app/trips/${tripId}`}
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to trip
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">Hunt report</p>
        <h1 className="bb-page-title">{trip.title}</h1>
        <p className="bb-page-sub">
          {/* v27.5.0.2 — Flavio: "remove the part... 'One entry per hunter on
              the trip. Edit qty + species...' instead have that sentence
              say something how use the fields below to input details for
              your trip log and choose your template to generate below." */}
          Use the fields below to input details for your trip log, then pick
          a template and generate the filled state form.
        </p>
      </header>
      <HarvestLogEditor
        tripId={tripId}
        log={log}
        mappedDocs={mappedDocs}
        tripState={trip.state ?? null}
        tripSpecies={trip.species_targeted ?? ''}
        guideId={profile.id}
        generatedLogs={generatedLogs}
        speciesOptions={speciesOptions}
        defaultSignatureDataUrl={defaultSignatureDataUrl}
      />
    </main>
  )
}
