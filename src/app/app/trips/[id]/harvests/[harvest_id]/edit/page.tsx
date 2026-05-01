import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../../../../_lib/auth'
import {
  fetchHarvestTagOptions,
  fetchTripDetail,
  type HarvestTagOptions,
} from '../../../../../_lib/queries'
import { createClient } from '@/lib/supabase/server'
import EditHarvestForm, { type HarvestEditInitial } from './EditHarvestForm'

type RouteParams = Promise<{ id: string; harvest_id: string }>

// v27.0b.3: guide-only edit + delete for an existing harvest. Pre-fills
// every field including the bound consumed_wallet_item_id; reuses the
// same hunter selector + tag picker + auto-fill semantics as create
// mode. Server-side updateHarvestAction handles the un-tag-old +
// tag-new logic.
export default async function EditHarvestPage({ params }: { params: RouteParams }) {
  const { id: tripId, harvest_id: harvestId } = await params
  const { profile } = await requireGuide()

  // Verify trip ownership + load participants for the form.
  const detail = await fetchTripDetail(profile.id, tripId)
  if (!detail) notFound()
  const { trip, participants } = detail

  // Fetch the harvest row, scoped to this trip.
  const sb = await createClient()
  const { data: harvest } = await sb
    .from('harvests')
    .select('id, trip_id, hunter_id, kind, species_name, method, quantity, tag_number, harvested_at, notes, consumed_wallet_item_id')
    .eq('id', harvestId)
    .eq('trip_id', tripId)
    .maybeSingle()
  if (!harvest) notFound()

  const harvestParticipants = participants
    .filter((p) => p.hunter_id && p.profile)
    .map((p) => ({ id: p.hunter_id as string, display_name: p.profile!.display_name }))

  const tagOptionsByHunter: Record<string, HarvestTagOptions> = {}
  const tagOptionsMap = await fetchHarvestTagOptions(
    profile.id,
    trip.id,
    harvestParticipants.map((p) => p.id)
  )
  tagOptionsMap.forEach((opts, hunterId) => {
    tagOptionsByHunter[hunterId] = opts
  })

  const initial: HarvestEditInitial = {
    id: harvest.id,
    trip_id: harvest.trip_id,
    hunter_id: harvest.hunter_id,
    kind: harvest.kind,
    species_name: harvest.species_name,
    method: harvest.method,
    quantity: harvest.quantity,
    tag_number: harvest.tag_number,
    harvested_at: harvest.harvested_at,
    notes: harvest.notes,
    consumed_wallet_item_id: harvest.consumed_wallet_item_id,
  }

  const basePath = `/app/trips/${trip.id}`

  return (
    <main className="bb-app-main">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to trip
      </Link>
      <header>
        <p className="bb-page-eyebrow">Trip</p>
        <h1 className="bb-page-title">Edit harvest</h1>
        <p className="bb-page-sub">{trip.title}</p>
      </header>

      <div className="bb-form-narrow mt-4">
        <EditHarvestForm
          initial={initial}
          participants={harvestParticipants}
          tagOptionsByHunter={tagOptionsByHunter}
          basePath={basePath}
        />
      </div>
    </main>
  )
}
