import { unstable_cache } from 'next/cache'
import { fetchRevenueSnapshot } from '../_lib/admin-queries'

// v27.6.0 — Mission Control / Revenue.
//
// Server-cached snapshot (~60s) so refreshing the page doesn't slam
// Supabase. unstable_cache is keyed on a static tag; every action
// that touches subscriptions revalidatePath()'s /admin/revenue, so
// admin writes show up immediately after the cache invalidates.
const getCached = unstable_cache(
  async () => await fetchRevenueSnapshot(),
  ['admin-revenue-snapshot'],
  { revalidate: 60, tags: ['admin-revenue'] },
)

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

export default async function AdminRevenuePage() {
  const snap = await getCached()
  const generatedAt = new Date(snap.generated_at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Mission Control</p>
        <h1 className="bb-page-title">Revenue</h1>
        <p className="bb-page-sub">
          Snapshot generated {generatedAt}. Cached ~60 seconds.
        </p>
      </header>

      <div className="bb-admin-stats mt-4">
        <Stat label="MRR" value={fmtMoney(snap.mrr_cents)} sub="Monthly recurring (paid only)" />
        <Stat label="ARR" value={fmtMoney(snap.arr_cents)} sub="MRR × 12" />
        <Stat label="Active paid" value={String(snap.active_paid_count)} sub="Excludes comps + trials" />
        <Stat label="Trialing" value={String(snap.trialing_count)} sub={`${fmtMoney(snap.trial_expected_mrr_cents)} expected MRR`} />
        <Stat label="Comps" value={String(snap.comp_count)} sub="comp_until ≥ today" />
        <Stat label="Past due" value={String(snap.past_due_count)} sub="Card declined / dunning" />
        <Stat label="Canceled this month" value={String(snap.canceled_this_month_count)} sub={new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />
      </div>

      <form action="/admin/revenue" method="get" className="mt-3">
        <button type="submit" className="bb-btn-secondary">Refresh</button>
      </form>
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bb-admin-stat">
      <span className="bb-admin-stat-label">{label}</span>
      <span className="bb-admin-stat-value">{value}</span>
      {sub ? <span className="bb-admin-stat-sub">{sub}</span> : null}
    </div>
  )
}
