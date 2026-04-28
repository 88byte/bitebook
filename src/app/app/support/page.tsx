import Link from 'next/link'
import { ArrowRight, Mail } from 'lucide-react'
import { requireGuide } from '../_lib/auth'

// v25.9: shared support entry point reachable from the guide sidebar (and
// from the settings page footer Help link on mobile, where the sidebar is
// hidden). Mailto-only by default; a real ticket form is post-launch.
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

            <div className="mt-4">
              <Link href="/app/welcome" className="bb-text-action bb-text-action-copper inline-flex">
                Quick walkthrough of the app
                <ArrowRight size={14} aria-hidden="true" style={{ marginLeft: '0.25rem' }} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
