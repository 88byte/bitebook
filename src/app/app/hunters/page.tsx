import { redirect } from 'next/navigation'
import { requireGuide } from '../_lib/auth'
import DashboardHero from '../_components/DashboardHero'
import InviteForm from './InviteForm'
import HuntersListView from './HuntersListView'

// v28.1.0e.1 — Outfitter members get redirected to /app/network?tab=hunters
// so the consolidated Network surface owns their hunter list. Pure guides
// keep the dedicated /app/hunters page with the DashboardHero + their own
// invite flow. The data-fetching grid is shared via HuntersListView.
export default async function HuntersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { profile, contextGuideId } = await requireGuide()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' ||
      profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  const sp = await searchParams
  const query = (sp.q ?? '').trim()
  if (isOutfitterMember) {
    const q = query ? `&q=${encodeURIComponent(query)}` : ''
    redirect(`/app/network?tab=hunters${q}`)
  }

  return (
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Your network"
        title="Hunters"
        subtitle="Invite hunters by email. Once they accept, you can add them to trips and shared records."
        bgImage="/banners/hunter-hero.png"
        eyebrowColor="copper"
        showShield={false}
        objectPosition="top"
        rightSlot={<InviteForm compact />}
      />

      <div className="bb-page-divider mt-4" aria-hidden="true" />

      <HuntersListView
        contextGuideId={contextGuideId}
        query={query}
        searchActionPath="/app/hunters"
      />
    </main>
  )
}
