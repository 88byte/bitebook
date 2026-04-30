import { UserCheck } from 'lucide-react'
import { requireHunter } from '../../_lib/auth'
import { fetchHunterGuides } from '../../_lib/queries'
import DashboardHero from '../../_components/DashboardHero'
import MyGuidesList from './MyGuidesList'

// v27.0a.12: Guides page (hunter-side) mirrors the Hunters page rebuild.
// Hero banner reuses the dashboard image. Guide cards use the shared
// NetworkPersonCard via MyGuidesList. NO invite form (hunters can't invite
// guides) and NO remove action (hunter can't drop a guide directly — that
// stays guide-side via removeHunterAction).
export default async function HunterGuidesPage() {
  const { profile } = await requireHunter()
  const guides = await fetchHunterGuides(profile.id)

  return (
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Your network"
        title="Guides"
        subtitle="Guides you're connected with on past or upcoming trips."
      />

      <div className="bb-net-section-head">
        <span className="bb-net-section-icon" aria-hidden="true">
          <UserCheck size={14} />
        </span>
        <span className="bb-net-section-title">Your guides</span>
      </div>

      <MyGuidesList guides={guides} />
    </main>
  )
}
