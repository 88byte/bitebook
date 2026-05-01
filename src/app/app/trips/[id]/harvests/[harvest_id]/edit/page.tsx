import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../../../../_lib/auth'
import {
  fetchHarvestTagOptions,
  fetchTripDetail,
  fetchSpecies,
  type HarvestTagOptions,
} from '../../../../../_lib/queries'
import { createClient } from '@/lib/supabase/server'
import { normalizeWeaponRestriction } from '@/lib/methods'
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

  // v27.0b.3.1 / .4.7: re-pull species + identifier + weapon_restriction
  // from the consumed wallet item (if linked). Wallet item is the source
  // of truth — the harvest row's stored species_name / tag_number / method
  // are denormalized snapshots and can drift if the hunter edited the tag
  // after the harvest was logged. Fall back to the harvest row's snapshot
  // when the wallet item is missing or unlinked. Same precedence chain
  // as queries.ts method_display so the edit form opens with the value
  // the trip detail is already showing.
  let liveSpecies: string | null = harvest.species_name
  let liveTagNumber: string | null = harvest.tag_number
  let liveMethod: string | null = harvest.method
  if (harvest.consumed_wallet_item_id) {
    const { data: walletItem } = await sb
      .from('wallet_items')
      .select('id, species, identifier, extras')
      .eq('id', harvest.consumed_wallet_item_id)
      .maybeSingle()
    if (walletItem) {
      liveSpecies = walletItem.species ?? harvest.species_name
      liveTagNumber = walletItem.identifier ?? harvest.tag_number
      const extras = (walletItem.extras ?? null) as { weapon_restriction?: string } | null
      const wallet_method = normalizeWeaponRestriction(extras?.weapon_restriction)
      // method chain: wallet → harvest snapshot → trip default
      liveMethod = wallet_method ?? harvest.method ?? trip.method ?? null
    }
  }

  const harvestParticipants = participants
    .filter((p) => p.hunter_id && p.profile)
    .map((p) => ({ id: p.hunter_id as string, display_name: p.profile!.display_name }))

  const tagOptionsByHunter: Record<string, HarvestTagOptions> = {}
  const tagOptionsMap = await fetchHarvestTagOptions(
    profile.id,
    trip.id,
    harvestParticipants.map((p) => p.id),
    harvest.consumed_wallet_item_id ?? null
  )
  tagOptionsMap.forEach((opts, hunterId) => {
    tagOptionsByHunter[hunterId] = opts
  })

  const initial: HarvestEditInitial = {
    id: harvest.id,
    trip_id: harvest.trip_id,
    hunter_id: harvest.hunter_id,
    kind: harvest.kind,
    species_name: liveSpecies,
    method: liveMethod,
    quantity: harvest.quantity,
    tag_number: liveTagNumber,
    harvested_at: harvest.harvested_at,
    notes: harvest.notes,
    consumed_wallet_item_id: harvest.consumed_wallet_item_id,
  }

  const basePath = `/app/trips/${trip.id}`

  // v27.0b.6: species seed for SpeciesField datalist, filtered to trip kind.
  const speciesOptions = await fetchSpecies(trip.kind)

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
          speciesOptions={speciesOptions}
          tripKind={trip.kind}
        />
      </div>
    </main>
  )
}
