import Link from 'next/link'
import { ArrowRight, Mail } from 'lucide-react'
import { requireHunter } from '../../_lib/auth'

// v25.9: hunter-side support entry point. Same shape as /app/support but
// addressed to a hunter audience. There is no /app/h/welcome onboarding
// flow yet, so the secondary link points back to the hunter dashboard.
export default async function HunterSupportPage() {
  const { profile } = await requireHunter()
  const displayName = profile.display_name ?? 'Hunter'
  const subject = encodeURIComponent(`Bite Book support - ${displayName}`)
  const mailto = `mailto:support@lastbite.pro?subject=${subject}`

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">We are here</p>
        <h1 className="bb-page-title">Support</h1>
        <p className="bb-page-sub">
          Need a hand? Email us at support@lastbite.pro. We answer most messages within a business day.
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
              <Link href="/app/h" className="bb-text-action bb-text-action-copper inline-flex">
                Back to your dashboard
                <ArrowRight size={14} aria-hidden="true" style={{ marginLeft: '0.25rem' }} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
