import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchAcceptedHunters } from '../../_lib/queries'
import NewTripForm from './NewTripForm'

// v26.4: structured-section layout — the form renders its own per-section
// .bb-tile wrappers, so this page no longer wraps the form in a single tile.
export default async function NewTripPage() {
  const { profile } = await requireGuide()
  const hunters = await fetchAcceptedHunters(profile.id)

  return (
    <main className="bb-app-main">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header>
        <p className="bb-page-eyebrow">Plan a trip</p>
        <h1 className="bb-page-title">New trip</h1>
        <p className="bb-page-sub">
          Set the basics now. You can add harvests, photos, and warden shares once you&rsquo;re in the field.
        </p>
      </header>

      <div className="bb-form-narrow mt-4">
        <NewTripForm hunters={hunters} />
      </div>
    </main>
  )
}
