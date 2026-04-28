import { requireHunter } from '../../_lib/auth'
import { fetchHunterGuides } from '../../_lib/queries'
import MyGuidesList from './MyGuidesList'

// v26.3: hunter's My Guides list. Promoted from a 3-row dashboard widget into
// its own route so a hunter who works with multiple outfitters can scan,
// search, and (eventually) message any guide they're connected to.
export default async function HunterGuidesPage() {
  const { profile } = await requireHunter()
  const guides = await fetchHunterGuides(profile.id)

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Your network</p>
        <h1 className="bb-page-title">Your guides</h1>
        <p className="bb-page-sub">
          {guides.length === 0
            ? 'No guides yet. Once a guide adds you to their network, they show up here.'
            : `You're connected to ${guides.length} ${guides.length === 1 ? 'guide' : 'guides'}.`}
        </p>
      </header>

      <div className="bb-form-narrow mt-4">
        <MyGuidesList guides={guides} />
      </div>
    </main>
  )
}
