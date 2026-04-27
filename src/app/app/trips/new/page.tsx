import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import NewTripForm from './NewTripForm'

export default async function NewTripPage() {
  const { supabase, profile } = await requireGuide()

  // Build the hunter candidate list from invitations this guide has sent
  // and that have been accepted. RLS on invitations restricts to guide_id =
  // self, so the .eq() is belt-and-braces.
  const { data: accepted } = await supabase
    .from('invitations')
    .select('accepted_by, profile:profiles!invitations_accepted_by_fkey(id, display_name)')
    .eq('guide_id', profile.id)
    .eq('status', 'accepted')

  type HunterCandidate = { id: string; display_name: string }
  const candidateRows = (accepted ?? []) as Array<{ profile: HunterCandidate | null }>
  const hunters = candidateRows
    .map((row) => row.profile)
    .filter((p): p is HunterCandidate => !!p && !!p.id)
    // de-dupe — a hunter might have been re-invited
    .filter((p, idx, arr) => arr.findIndex((q) => q.id === p.id) === idx)
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

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
