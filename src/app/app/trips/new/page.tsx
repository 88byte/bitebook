import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchAcceptedHunters } from '../../_lib/queries'
import NewTripForm from './NewTripForm'

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
        <ChevronLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header>
        <p className="bb-page-eyebrow">Plan a trip</p>
        <h1 className="bb-page-title">New trip</h1>
        <p className="bb-page-sub">
          Set the basics now — you can add harvests, photos, and warden shares once you&rsquo;re in the field.
        </p>
      </header>

      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <NewTripForm hunters={hunters} />
        </div>
      </section>
    </main>
  )
}
