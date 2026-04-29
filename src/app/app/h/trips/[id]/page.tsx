import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  Clock,
  MapPin,
  Building,
  Map,
  Mountain,
  TreeDeciduous,
  Crosshair,
  PawPrint,
  FileText,
  Users,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { requireHunter } from '../../../_lib/auth'
import { fetchHunterTripDetail, fetchHunterTripReview } from '../../../_lib/queries'
import StatusPill from '../../../_components/StatusPill'
import { tripDateRange, timeOfDay, initials, relativeOrDate } from '../../../_lib/format'
import { markStepDone } from '../../../_lib/onboarding'
import ReviewForm from './ReviewForm'

type RouteParams = Promise<{ id: string }>

// v26.5.8: hunter-side trip detail rebuilt to mirror guide v26.5.2 design.
// Same circular copper section icons, same 2/3-col detail grids, same
// locked icon family. Hunter-specific content: their own harvests, the
// guide block, other hunters on the trip. No edit / no add-harvest /
// no close-trip controls — those are guide-side actions.
//
// v26.0: best-effort marks the `first_trip_viewed` onboarding step done
// on each successful render, and (for completed trips) renders ReviewForm
// so the hunter can leave a 1-5 star review.
export default async function HunterTripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { supabase, profile } = await requireHunter()

  const detail = await fetchHunterTripDetail(profile.id, id)
  if (!detail) notFound()

  // v26.0: best-effort onboarding mark. If it fails (RLS, transient), the
  // step will be marked the next time the hunter opens any trip detail.
  try {
    await markStepDone(supabase, profile.id, 'first_trip_viewed')
  } catch (e) {
    console.warn('[h.trips.detail] markStepDone failed', e)
  }

  const isCompleted = detail.trip.status === 'completed'
  const existingReview = isCompleted ? await fetchHunterTripReview(profile.id, id) : null
  const canEdit = existingReview
    ? Date.now() - new Date(existingReview.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
    : true

  const { trip, guide, participants, myHarvests } = detail
  const guideLabel = guide ? (guide.business_name?.trim() || guide.display_name) : 'Your guide'
  const dateRange = tripDateRange(trip.starts_at, trip.ends_at)
  const otherHunters = participants.filter((p) => p.hunter_id !== profile.id)

  return (
    <main className="bb-app-main">
      <Link
        href="/app/h/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        My trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <p className="bb-page-sub">View your trip details, harvests, and guide.</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
        </div>
      </header>

      <div className="bb-form-narrow mt-4 flex flex-col gap-4">
        {/* GUIDE */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-guide">
          <div className="bb-tile-body">
            <SectionHead id="td-guide" icon={Users} label="Guide" />
            <div className="bb-detail-row">
              <span className="bb-avatar" aria-hidden="true">{initials(guideLabel)}</span>
              <div className="flex-1 min-w-0">
                <div className="bb-detail-name">{guideLabel}</div>
                {guide?.business_name && guide?.display_name && (
                  <div className="bb-detail-sub">{guide.display_name}</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* DATES */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-dates">
          <div className="bb-tile-body">
            <SectionHead id="td-dates" icon={Calendar} label="Dates" />
            <div className="bb-detail-grid-3">
              <DetailCell
                icon={Calendar}
                label="Start"
                node={<DateTimeStack iso={trip.starts_at} />}
              />
              <DetailCell
                icon={Calendar}
                label="End"
                node={trip.ends_at ? <DateTimeStack iso={trip.ends_at} /> : <span className="bb-detail-cell-value">Not set</span>}
              />
              <DetailCell icon={Clock} label="Range" value={dateRange} />
            </div>
          </div>
        </section>

        {/* LOCATION */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-location">
          <div className="bb-tile-body">
            <SectionHead id="td-location" icon={MapPin} label="Location" />
            <div className="bb-detail-grid-3">
              <DetailCell icon={Building} label="City" value={trip.city || 'Not set'} />
              <DetailCell icon={Map} label="State" value={trip.state || 'Not set'} />
              <DetailCell icon={Mountain} label="Zone" value={trip.zone || 'Not set'} />
            </div>
            <div className="bb-detail-grid-3" style={{ marginTop: '0.85rem' }}>
              <DetailCell icon={TreeDeciduous} label="County" value={trip.county || 'Not set'} />
            </div>
          </div>
        </section>

        {/* HUNT DETAILS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-hunt">
          <div className="bb-tile-body">
            <SectionHead id="td-hunt" icon={Crosshair} label="Hunt details" />
            <div className="bb-detail-grid-2">
              <DetailCell icon={PawPrint} label="Species targeted" value={trip.species_targeted || 'Not set'} />
              <DetailCell icon={Crosshair} label="Method" value={trip.method || 'Not set'} />
            </div>
          </div>
        </section>

        {/* NOTES */}
        {trip.notes && (
          <section className="bb-tile bb-form-section" aria-labelledby="td-notes">
            <div className="bb-tile-body">
              <SectionHead id="td-notes" icon={FileText} label="Notes" />
              <p className="text-sm" style={{ color: 'var(--color-ink)', whiteSpace: 'pre-wrap' }}>
                {trip.notes}
              </p>
            </div>
          </section>
        )}

        {/* YOUR HARVESTS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-my-harvests">
          <div className="bb-tile-body">
            <SectionHead id="td-my-harvests" icon={Activity} label="Your harvests" />
            {myHarvests.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No harvests on this trip</div>
                <p className="bb-empty-sub">
                  Harvests your guide logs for you will show up here.
                </p>
              </div>
            ) : (
              <div className="bb-detail-list">
                {myHarvests.map((h) => {
                  const species = h.species_name ?? (h.kind === 'fishing' ? 'Catch' : 'Harvest')
                  return (
                    <div key={h.id} className="bb-detail-row">
                      <span className="bb-avatar" aria-hidden="true">{initials(species)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="bb-detail-name">
                          {species}
                          {h.tag_number ? <span style={{ color: 'var(--color-ink-soft)' }}> · Tag {h.tag_number}</span> : null}
                        </div>
                        <div className="bb-detail-sub">
                          {timeOfDay(h.harvested_at)} · {relativeOrDate(h.harvested_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* OTHER HUNTERS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-other-hunters">
          <div className="bb-tile-body">
            <SectionHead id="td-other-hunters" icon={Users} label="Other hunters" />
            {otherHunters.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">Just you on this trip</div>
                <p className="bb-empty-sub">No other hunters were added to this trip.</p>
              </div>
            ) : (
              <div className="bb-detail-list">
                {otherHunters.map((p) => {
                  const name = p.profile?.display_name ?? p.guest_name ?? 'Hunter'
                  return (
                    <div key={p.id} className="bb-detail-row">
                      <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="bb-detail-name">{name}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* REVIEW (only on completed trips) */}
        {isCompleted && (
          <ReviewForm
            tripId={trip.id}
            existingReview={existingReview}
            canEdit={canEdit}
          />
        )}
      </div>
    </main>
  )
}

function SectionHead({ id, icon: Icon, label }: { id: string; icon: LucideIcon; label: string }) {
  return (
    <h2 id={id} className="bb-section-head-iconed">
      <span className="bb-section-head-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="bb-section-head-label">{label}</span>
    </h2>
  )
}

function DetailCell({
  icon: Icon,
  label,
  value,
  node,
}: {
  icon: LucideIcon
  label: string
  value?: string
  node?: React.ReactNode
}) {
  return (
    <div className="bb-detail-cell">
      <span className="bb-detail-cell-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="bb-detail-cell-body">
        <div className="bb-detail-cell-label">{label}</div>
        {node ? <div>{node}</div> : <div className="bb-detail-cell-value">{value}</div>}
      </div>
    </div>
  )
}

// Same short single-line "Apr 28, 11:45 AM" format used on guide trip detail.
function DateTimeStack({ iso }: { iso: string }) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return <span className="bb-detail-cell-value">{iso}</span>
  }
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return <div className="bb-detail-cell-value">{`${date}, ${time}`}</div>
}
