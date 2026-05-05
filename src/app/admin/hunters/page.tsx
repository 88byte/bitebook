import { ShieldCheck } from 'lucide-react'
import { fetchAdminHunters } from '../_lib/admin-queries'
import { requireAdmin } from '../../app/_lib/auth'

// v27.6.1 — Mission Control / Hunters. Parallel to /admin (Guides):
// list every hunter across the platform with their inviting guide
// + invite status + trips count + last login.
//
// Today read-only — no Manage detail page yet (slated for v27.6.2
// alongside Activity feed). Search by name/email + chip filter by
// invite status.

type SearchParams = Promise<{ q?: string; status?: string }>

const STATUS_CHIPS: { key: 'all' | 'accepted' | 'pending' | 'no_invite'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'accepted',   label: 'Accepted' },
  { key: 'pending',    label: 'Pending' },
  { key: 'no_invite',  label: 'No invite' },
]

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function AdminHuntersPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAdmin()
  const params = await searchParams
  const q = (params.q ?? '').trim().toLowerCase()
  const statusParam = STATUS_CHIPS.find((c) => c.key === params.status)?.key ?? 'all'

  const all = await fetchAdminHunters()

  let rows = all
  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.display_name} ${r.email} ${r.inviting_guide_name ?? ''} ${r.inviting_guide_business ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }
  if (statusParam !== 'all') {
    if (statusParam === 'no_invite') {
      rows = rows.filter((r) => r.invite_status === null)
    } else {
      rows = rows.filter((r) => r.invite_status === statusParam)
    }
  }

  const counts = {
    all: all.length,
    accepted: all.filter((r) => r.invite_status === 'accepted').length,
    pending: all.filter((r) => r.invite_status === 'pending').length,
    no_invite: all.filter((r) => r.invite_status === null).length,
  } as const

  function chipHref(key: typeof STATUS_CHIPS[number]['key']): string {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (key !== 'all') sp.set('status', key)
    return `/admin/hunters${sp.toString() ? `?${sp}` : ''}`
  }

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Mission Control</p>
        <h1 className="bb-page-title">Hunters</h1>
        <p className="bb-page-sub">
          {all.length} {all.length === 1 ? 'hunter' : 'hunters'} on Bite Book.
        </p>
        <div className="bb-admin-loggedin" aria-label="Signed in as admin">
          <ShieldCheck size={12} aria-hidden="true" />
          <span>Logged in as admin: {user.email}</span>
        </div>
      </header>

      <form
        action="/admin/hunters"
        method="get"
        className="mt-4"
        style={{ display: 'flex', gap: '0.5rem', maxWidth: '32rem' }}
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search hunter name, email, or guide…"
          className="bb-input"
          style={{ flex: 1 }}
        />
        {statusParam !== 'all' ? <input type="hidden" name="status" value={statusParam} /> : null}
        <button type="submit" className="bb-btn-secondary">Search</button>
      </form>

      <div className="bb-chip-row mt-3" role="tablist" aria-label="Filter by invite status">
        {STATUS_CHIPS.map((c) => (
          <a
            key={c.key}
            href={chipHref(c.key)}
            role="tab"
            aria-selected={statusParam === c.key}
            className={`bb-chip ${statusParam === c.key ? 'is-active' : ''}`}
          >
            {c.label}
            <span style={{ opacity: 0.65, marginLeft: 6 }}>({counts[c.key]})</span>
          </a>
        ))}
      </div>

      <section className="mt-4">
        {rows.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No hunters match</div>
            <p className="bb-empty-sub">Try clearing the search or selecting a different filter.</p>
          </div>
        ) : (
          <div className="bb-admin-table-wrap">
            <table className="bb-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Inviting guide</th>
                  <th>Invite status</th>
                  <th>Joined</th>
                  <th>Last sign-in</th>
                  <th style={{ textAlign: 'right' }}>Trips</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hunter_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span>{r.display_name || '—'}</span>
                        <span className="bb-admin-role-pill bb-admin-role-pill-hunter" aria-label="Hunter">Hunter</span>
                        {r.is_admin ? (
                          <span className="bb-admin-row-pill" aria-label="Admin">
                            <ShieldCheck size={10} aria-hidden="true" />
                            Admin
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="bb-admin-cell-email">{r.email || '—'}</td>
                    <td>
                      {r.inviting_guide_name ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{r.inviting_guide_name}</span>
                          {r.inviting_guide_business ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-soft)' }}>{r.inviting_guide_business}</span>
                          ) : null}
                        </div>
                      ) : <span style={{ color: 'var(--color-ink-soft)' }}>—</span>}
                    </td>
                    <td>{r.invite_status ? r.invite_status[0].toUpperCase() + r.invite_status.slice(1) : '—'}</td>
                    <td>{fmtDate(r.joined_date)}</td>
                    <td>{fmtDateTime(r.last_sign_in_at)}</td>
                    <td style={{ textAlign: 'right' }}>{r.trips_count}</td>
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
