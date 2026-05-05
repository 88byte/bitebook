import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { fetchAdminAccounts } from './_lib/admin-queries'
import type { AdminAccountRow } from './_lib/admin-queries'
import { requireAdmin } from '../app/_lib/auth'

// v27.6.0 — Mission Control / Accounts (the index).
//
// Search by name OR email (?q=…), tier filter via chip row (?tier=full|read_only|locked|all).
// Sort default = signup_date desc.

type SearchParams = Promise<{ q?: string; tier?: string }>

const TIER_CHIPS: { key: 'all' | 'full' | 'read_only' | 'locked'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'full',      label: 'Full' },
  { key: 'read_only', label: 'Read-only' },
  { key: 'locked',    label: 'Locked' },
]

const PLAN_LABELS: Record<AdminAccountRow['plan'], string> = {
  monthly: '$9 / mo',
  annual:  '$90 / yr',
  comp:    'Comp',
  none:    '—',
}

// v27.6.1 — "Incomplete" relabeled to "Setup incomplete" so it's
// self-explanatory in the table. This is the Stripe state when
// signup started but payment was never confirmed (no PM attached,
// abandoned checkout, etc.).
const STATUS_LABEL: Record<NonNullable<AdminAccountRow['status']>, string> = {
  trialing:   'Trialing',
  active:     'Active',
  past_due:   'Past due',
  canceled:   'Canceled',
  incomplete: 'Setup incomplete',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function tierPillClass(tier: AdminAccountRow['tier']): string {
  switch (tier) {
    case 'full':      return 'bb-pill bb-pill-planned'
    case 'read_only': return 'bb-pill bb-pill-active'
    case 'locked':    return 'bb-pill bb-pill-canceled'
  }
}

export default async function AdminAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  // v27.6.0.1 — pull the admin's own email for the "Logged in as"
  // strip below the page title. Admin accounts are filtered out of
  // the table itself; this is the only place admins see themselves
  // in Mission Control.
  const { user } = await requireAdmin()
  const params = await searchParams
  const q = (params.q ?? '').trim().toLowerCase()
  const tierParam = TIER_CHIPS.find((c) => c.key === params.tier)?.key ?? 'all'

  const all = await fetchAdminAccounts()
  let rows = all
  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.display_name} ${r.email} ${r.business_name ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  if (tierParam !== 'all') {
    rows = rows.filter((r) => r.tier === tierParam)
  }

  function chipHref(key: typeof TIER_CHIPS[number]['key']): string {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (key !== 'all') sp.set('tier', key)
    return `/admin${sp.toString() ? `?${sp}` : ''}`
  }

  const counts = {
    all: all.length,
    full: all.filter((r) => r.tier === 'full').length,
    read_only: all.filter((r) => r.tier === 'read_only').length,
    locked: all.filter((r) => r.tier === 'locked').length,
  } as const

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Mission Control</p>
        <h1 className="bb-page-title">Guides</h1>
        <p className="bb-page-sub">
          {all.length} {all.length === 1 ? 'guide' : 'guides'} on Bite Book.
        </p>
        <div className="bb-admin-loggedin" aria-label="Signed in as admin">
          <ShieldCheck size={12} aria-hidden="true" />
          <span>Logged in as admin: {user.email}</span>
        </div>
      </header>

      <form
        action="/admin"
        method="get"
        className="mt-4"
        style={{ display: 'flex', gap: '0.5rem', maxWidth: '32rem' }}
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, business…"
          className="bb-input"
          style={{ flex: 1 }}
        />
        {tierParam !== 'all' ? <input type="hidden" name="tier" value={tierParam} /> : null}
        <button type="submit" className="bb-btn-secondary">Search</button>
      </form>

      <div className="bb-chip-row mt-3" role="tablist" aria-label="Filter by tier">
        {TIER_CHIPS.map((c) => (
          <Link
            key={c.key}
            href={chipHref(c.key)}
            role="tab"
            aria-selected={tierParam === c.key}
            className={`bb-chip ${tierParam === c.key ? 'is-active' : ''}`}
          >
            {c.label}
            <span style={{ opacity: 0.65, marginLeft: 6 }}>({counts[c.key]})</span>
          </Link>
        ))}
      </div>

      <section className="mt-4">
        {rows.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No accounts match</div>
            <p className="bb-empty-sub">Try clearing the search or selecting a different tier.</p>
          </div>
        ) : (
          <div className="bb-admin-table-wrap">
            <table className="bb-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Business</th>
                  <th>Plan</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Trial / next renew</th>
                  <th>Signed up</th>
                  <th>Hunters</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.guide_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span>{r.display_name || '—'}</span>
                        <span className="bb-admin-role-pill bb-admin-role-pill-guide" aria-label="Guide">Guide</span>
                        {r.is_admin ? (
                          <span className="bb-admin-row-pill" aria-label="Admin">
                            <ShieldCheck size={10} aria-hidden="true" />
                            Admin
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="bb-admin-cell-email">{r.email || '—'}</td>
                    <td>{r.business_name || '—'}</td>
                    <td>{PLAN_LABELS[r.plan]}</td>
                    <td><span className={tierPillClass(r.tier)}>{r.tier === 'read_only' ? 'Read-only' : r.tier[0].toUpperCase() + r.tier.slice(1)}</span></td>
                    <td>{r.status ? STATUS_LABEL[r.status] : '—'}</td>
                    <td>{formatDate(r.trial_end ?? r.current_period_end)}</td>
                    <td>{formatDate(r.signup_date)}</td>
                    <td style={{ textAlign: 'right' }}>{r.hunters_count}</td>
                    <td>
                      <Link href={`/admin/guides/${r.guide_id}`} className="bb-cta-sm">Manage</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
