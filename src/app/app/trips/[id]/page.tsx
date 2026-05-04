import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Share2,
  Activity,
  Users,
} from 'lucide-react'
import { initials } from '../../_lib/format'
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
import StatusPill from '../../_components/StatusPill'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'
import CancelTripButton from './CancelTripButton'
import SaveAsTemplateButton from './SaveAsTemplateButton'
import TripDetailEditor from './TripDetailEditor'
import TripDocsCard from './TripDocsCard'

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
  const [harvestLogSummary, tripDocs, attachableDocs, speciesOptions, walletLinksByHunter] = await Promise.all([
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

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <p className="bb-page-sub">View and manage trip details. Changes save as you type.</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
        </div>
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
            {harvestLogSummary.exists ? 'View hunt logs' : 'Generate hunt logs'}
          </Link>
          <button
            type="button"
            className="bb-btn-secondary"
            disabled
            title="Warden share ships later in Sprint 2"
            aria-label="Share with warden (coming soon)"
          >
            <Share2 size={14} aria-hidden="true" />
            Share with warden
          </button>
        </div>
      </div>

      {/* v27.3.3.1: divider below action row, before content. */}
      <div className="bb-page-divider mt-3" aria-hidden="true" />

      {/* v27.1.3.0.5: participant status panel — restored from v27.0b.6
          (was lost when v27.1.1.0.3e.6 merged read-only DetailCells into
          the inline TripDetailEditor). Read-only by design — the
          collapsed Hunters section in the editor below owns the
          add/remove flow; this panel only visualizes who's on the trip
          and whether they've linked their license + tag. */}
      {participants.length > 0 && (() => {
        // v27.3.3.1 — title flips when any hunter has a pending
        // license/tag link, so the guide sees the section as a
        // todo when something's incomplete.
        const anyPending = participants.some((p) => {
          if (!p.hunter_id) return false
          const links = walletLinksByHunter.get(p.hunter_id) ?? []
          const hasLicense = links.some((l) => l.type === 'license')
          const hasTag = links.some((l) => l.type === 'tag')
          if (!hasLicense) return true
          if (!hasTag && trip.species_targeted) return true
          return false
        })
        const sectionTitle = anyPending ? 'Hunters still needing action' : 'Hunters on this trip'
        return (
        <section className="bb-tile bb-form-section mt-4">
          <div className="bb-tile-body">
            <h2
              className="bb-form-section-head"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Users size={16} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
              {sectionTitle}
            </h2>
            <div className="bb-detail-list">
              {participants.map((p) => {
                const name = p.profile?.display_name ?? p.guest_name ?? 'Unnamed hunter'
                const links = p.hunter_id ? walletLinksByHunter.get(p.hunter_id) ?? [] : []
                const hasLicense = links.some((l) => l.type === 'license')
                const hasTag = links.some((l) => l.type === 'tag')
                const pending: string[] = []
                if (p.hunter_id) {
                  if (!hasLicense) pending.push('license')
                  if (!hasTag && trip.species_targeted) pending.push('tag')
                }
                return (
                  <div key={p.id} className="bb-detail-row">
                    <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="bb-detail-name">{name}</div>
                      <div className="bb-detail-sub">
                        {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                      </div>
                      {(links.length > 0 || pending.length > 0) && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.35rem',
                            marginTop: '0.4rem',
                          }}
                        >
                          {links.map((l) => {
                            const typeLabel =
                              l.type === 'license'
                                ? 'License'
                                : l.type === 'tag'
                                  ? 'Tag'
                                  : l.type === 'permit'
                                    ? 'Permit'
                                    : l.type === 'stamp'
                                      ? 'Stamp'
                                      : 'Doc'
                            return (
                              <span
                                key={l.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '999px',
                                  background: 'var(--color-paper-tint)',
                                  border: '1px solid var(--color-ink-tint)',
                                  fontSize: '0.78rem',
                                  color: 'var(--color-ink)',
                                }}
                              >
                                <strong style={{ fontWeight: 600 }}>{typeLabel}:</strong>{' '}
                                {l.identifier}
                                {l.species ? ` · ${l.species}` : ''}
                                {' ✓'}
                              </span>
                            )
                          })}
                          {pending.map((kind) => (
                            <span
                              key={`pending-${kind}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                background: 'var(--color-copper)',
                                color: '#fff',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                              }}
                            >
                              Pending: {kind}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )
      })()}

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
        {/* v27.1.3.0.4: drop the now-redundant inner bb-form-narrow on
            the docs card — outer wrapper handles the centering. */}
        <TripDocsCard
          tripId={trip.id}
          tripDocs={tripDocs}
          attachable={attachableDocs}
          participants={docParticipants}
        />
      </div>
      </div>
    </main>
  )
}
