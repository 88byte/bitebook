import { Mail } from 'lucide-react'
import { requireGuide } from '../_lib/auth'

// v25.9: shared support entry point reachable from the guide sidebar (and
// from the settings page footer Help link on mobile, where the sidebar is
// hidden). Mailto-only by default; a real ticket form is post-launch.
//
// v27.1.5.1.1: dropped the "Quick walkthrough of the app" link to
// /app/welcome — that route was deleted along with the legacy G0
// checklist. First-time setup is the /app/onboarding wizard, gated
// once via onboarded_at; once a guide is on the dashboard they're
// already past it, so a "walkthrough" link from Support would dead-end.
export default async function GuideSupportPage() {
  const { profile } = await requireGuide()
  const displayName = profile.display_name ?? 'Guide'
  const subject = encodeURIComponent(`Bite Book support - ${displayName}`)
  const mailto = `mailto:support@lastbite.pro?subject=${subject}`

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">We are here</p>
        <h1 className="bb-page-title">Support</h1>
        <p className="bb-page-sub">
          Stuck on something? Email us at support@lastbite.pro. We answer most messages within a business day.
        </p>
      </header>

      <div className="bb-form-narrow">
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <a href={mailto} className="bb-cta-sm inline-flex">
              <Mail size={14} aria-hidden="true" />
              Email support
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
