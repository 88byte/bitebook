import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Share2,
  Activity,
} from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import {
  fetchTripDetail,
  fetchAcceptedHunters,
  fetchSpecies,
  fetchTripWalletLinks,
} from '../../_lib/queries'
import { fetchHarvestLogSummary } from '../../_lib/harvest-log-queries'
import {
  fetchTripDocsForGuide,
  fetchAttachableDocsForGuide,
} from '../../_lib/trip-doc-queries'
import { loadGuideDefaultSignatureDataUrl } from '../../_lib/guide-default-signature'
import { tripHasAnyGeneratedLog } from '../../_lib/warden-share'
import StatusPill from '../../_components/StatusPill'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'
import CancelTripButton from './CancelTripButton'
import SaveAsTemplateButton from './SaveAsTemplateButton'
import TripDetailEditor from './TripDetailEditor'
import TripDocsCard from './TripDocsCard'
import HuntersOnTripPanel, {
  type ParticipantRow,
  type WalletLinksByHunter,
} from './HuntersOnTripPanel'

type RouteParams = Promise<{ id: string }>

// v27.1.1.0.3e.6: trip detail IS the edit surface. Read-only DetailCells
// have been replaced with the inline TripDetailEditor (same Trip Overview
// + collapsed Location/Hunt/Hunters/Notes pattern that previously lived
// on /app/trips/[id]/edit). Auto-save on blur — no Save Changes button.
//
// The /edit route now redirects here for back-compat. The hunter side
// (/app/h/trips/[id]) keeps its existing read-only render.
export default async function TripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()

  const detail = await fetchTripDetail(profile.id, id)
  if (!detail) notFound()

  const { trip, participants } = detail
  const [harvestLogSummary, tripDocs, attachableDocs, speciesOptions, walletLinksByHunter, defaultSignatureDataUrl, hasGeneratedLog] = await Promise.all([
    fetchHarvestLogSummary(trip.id),
    fetchTripDocsForGuide(trip.id),
    fetchAttachableDocsForGuide(profile.id),
    // v27.1.3.0.2: full species pool for the Hunt details Species picker
    // inside TripDetailEditor (replaces the plain text input).
    fetchSpecies(),
    // v27.1.3.0.5: per-hunter wallet-link chips on the participant
    // status panel (license / tag / pending — restored from v27.0b.6
    // which was lost in the v27.1.1.0.3e.6 edit-merge).
    fetchTripWalletLinks(trip.id),
    // v27.4.0 — pre-fetch guide's default signature for Sign-as-guide
    // modal pre-fill on waiver docs.
    loadGuideDefaultSignatureDataUrl(profile.id),
    // v27.5.0 — has any trip_generated_logs row been produced yet?
    // Drives whether to show the "Share with warden" button. Auto-
    // generation on warden-page entry handles the can-generate-now case,
    // but we hide the button on canceled trips and on planned-with-no-
    // logs to keep the action row honest about what's actually shareable.
    tripHasAnyGeneratedLog(trip.id),
  ])
  const isOpen = trip.status === 'planned' || trip.status === 'active'
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'

  // Participants list shaped for the Manage actions modal — only those with
  // a real hunter_id + resolved profile (guests can't have actions assigned
  // since RLS keys actions on auth user id).
  const docParticipants: Array<{ id: string; display_name: string }> = []
  for (const p of participants) {
    if (p.hunter_id && p.profile) {
      docParticipants.push({ id: p.profile.id, display_name: p.profile.display_name })
    }
  }

  // Hunters candidate list = union of currently-selected participants +
  // the guide's accepted hunters (so the participants pane shows
  // everyone on the trip even if a previously-accepted invitation has
  // since flipped, plus everyone the guide can add).
  const accepted = await fetchAcceptedHunters(profile.id)
  const candidatesById = new Map<string, { id: string; display_name: string }>()
  for (const a of accepted) candidatesById.set(a.id, a)
  for (const p of participants) {
    if (p.hunter_id && p.profile && !candidatesById.has(p.hunter_id)) {
      candidatesById.set(p.hunter_id, p.profile)
    }
  }
  const candidates = Array.from(candidatesById.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  )
  const initialSelectedIds = participants
    .map((p) => p.hunter_id)
    .filter((v): v is string => !!v)

  return (
    <main className="bb-app-main">
      {/* v27.1.3.0.4: wrap the entire trip-detail column in bb-form-narrow
          so the back link + header + action row + editor + docs card all
          align to the same centered column. Previously the editor and
          docs card were narrow-centered while the action row sat on
          the full <main> width — at 1280px+ the buttons appeared
          left-anchored against an empty right-side gutter. Single
          centered column eliminates the off-balance feel. */}
      <div className="bb-form-narrow">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      {/* v27.5.0.2 — status pill flush next to the title (Flavio: "the
          icons in the view and manage trip details... should be placed
          to the right of the trip title, right now its just hanging off
          to the right far away"). Title + pill share a flex row so the
          pill sits immediately after the title; subtitle drops below. */}
      <header>
        <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
        <div className="flex items-center gap-2 flex-wrap" style={{ minWidth: 0 }}>
          <h1 className="bb-page-title" style={{ margin: 0 }}>{trip.title}</h1>
          <StatusPill status={trip.status} />
        </div>
        <p className="bb-page-sub">View and manage trip details. Changes save as you type.</p>
      </header>

      {/* v27.3.3.1 — action row reordered per Flavio:
            LEFT cluster:
              • Save as template (secondary)
              • Wrap up trip (PRIMARY copper)
              • Cancel trip (destructive secondary)
            RIGHT cluster (off to the right):
              • View hunt logs (forest-green tinted .bb-cta-sm-forest)
              • Share with warden (secondary, disabled placeholder)
          The LEFT cluster keeps the "trip lifecycle" controls
          together; the RIGHT cluster is "viewing/sharing what's
          already in the trip." Forest green visually separates the
          right-side actions from the copper primary on the left. */}
      {/* v27.3.6: mobile (<640px) breaks the action row into TWO rows.
          Row 1: lifecycle cluster (Save as template / Wrap up trip /
          Cancel trip). Row 2: view/share cluster (View hunt logs /
          Share with warden). Desktop keeps the inline single-row
          layout with the right cluster pushed via margin-left:auto. */}
      <div
        className="bb-trip-actions"
        aria-label="Trip actions"
      >
        <div className="bb-trip-actions-primary">
          {(trip.status === 'active' || trip.status === 'planned' || trip.status === 'completed') && (
            <SaveAsTemplateButton tripId={trip.id} defaultLabel={trip.title} />
          )}
          {isOpen && <WrapUpTripButton tripId={trip.id} />}
          {isOpen && <CancelTripButton tripId={trip.id} />}
          {isClosed && <ReopenTripButton tripId={trip.id} />}
        </div>
        <div className="bb-trip-actions-secondary">
          <Link
            href={`/app/trips/${trip.id}/log`}
            className="bb-cta-sm bb-cta-sm-forest"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Activity size={14} aria-hidden="true" />
            {/* v27.5.0.2: drop the conditional Generate/View label.
                Flavio: the button wasn't generating anything, just
                navigating — the label flip was confusing. Single label,
                "Hunt logs", lets the editor page own the create-on-
                first-visit + Generate flows. */}
            Hunt logs
          </Link>
          {/* v27.5.0 — warden share. Hide on canceled trips (no log can
              exist) and on planned trips with no logs yet (auto-gen on
              warden open won't have any harvests to fill). Active +
              completed always show; planned-with-existing-logs (rare,
              but happens when a guide pre-fills a draft) shows. */}
          {trip.status !== 'canceled' &&
            (trip.status === 'active' || trip.status === 'completed' || hasGeneratedLog) && (
              <Link
                href={`/app/trips/${trip.id}/warden`}
                className="bb-btn-secondary"
                aria-label="Share with warden"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Share2 size={14} aria-hidden="true" />
                Share with warden
              </Link>
            )}
        </div>
      </div>

      {/* v27.3.3.1: divider below action row, before content. */}
      <div className="bb-page-divider mt-3" aria-hidden="true" />

      {/* v27.5.0.2 — move HuntersOnTripPanel BELOW the TripDetailEditor
          (which ends with the Notes section). Order is now:
            Trip detail editor (Overview / Location / Hunt details / Notes)
            ↓
            HUNTERS ON THIS TRIP panel
            ↓
            Trip docs card
          per Flavio: panel was sitting above the trip details and
          notes, pushing the form down. */}
      <div className="mt-4">
        <TripDetailEditor
          tripId={trip.id}
          initial={{
            title: trip.title,
            kind: trip.kind,
            starts_at: trip.starts_at,
            ends_at: trip.ends_at,
            city: trip.city,
            state: trip.state,
            zone: trip.zone,
            county: trip.county,
            species_targeted: trip.species_targeted,
            method: trip.method,
            notes: trip.notes,
          }}
          candidates={candidates}
          initialSelectedIds={initialSelectedIds}
          speciesOptions={speciesOptions}
        />

        {/* v27.3.8.1 item 1 — single combined panel for hunters. Replaces
            the prior split between (a) read-only status panel here and
            (b) Hunters accordion inside TripDetailEditor that owned add/
            remove. One section: status pills + a Manage hunters toggle
            that reveals HuntersMultiSelect inline and auto-saves.
            v27.3.8.2 bug 1 — Map -> plain object for the wallet links
            prop so the RSC payload serializes cleanly through the
            revalidate-after-action round-trip.
            v27.5.0.2 — moved here from above the editor (was pushing
            trip details + notes down). Now reads: editor → hunters →
            docs. */}
        {(() => {
          const walletLinksByHunterObj: WalletLinksByHunter = {}
          for (const [hunterId, links] of walletLinksByHunter.entries()) {
            walletLinksByHunterObj[hunterId] = links.map((l) => ({
              id: l.id,
              type: l.type,
              identifier: l.identifier,
              species: l.species,
            }))
          }
          return (
            <HuntersOnTripPanel
              tripId={trip.id}
              participants={participants as ParticipantRow[]}
              walletLinksByHunter={walletLinksByHunterObj}
              candidates={candidates}
              initialSelectedIds={initialSelectedIds}
              speciesTargeted={trip.species_targeted}
              canManage={isOpen}
            />
          )
        })()}

        {/* v27.1.3.0.4: drop the now-redundant inner bb-form-narrow on
            the docs card — outer wrapper handles the centering. */}
        <TripDocsCard
          tripId={trip.id}
          tripDocs={tripDocs}
          attachable={attachableDocs}
          participants={docParticipants}
          defaultSignatureDataUrl={defaultSignatureDataUrl}
        />
      </div>
      </div>
    </main>
  )
}
