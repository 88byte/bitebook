import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import InviteForm from './InviteForm'

type AcceptedRow = {
  id: string
  accepted_by: string | null
  email: string
  created_at: string
  display_name?: string | null
}
type PendingRow = {
  id: string
  email: string
  created_at: string
  expires_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function HuntersPage() {
  const { profile } = await requireGuide()
  const supabase = await createClient()

  const { data: invites } = await supabase
    .from('invitations')
    .select('id, email, status, accepted_by, created_at, expires_at')
    .eq('guide_id', profile.id)
    .order('created_at', { ascending: false })

  const accepted: AcceptedRow[] = (invites ?? [])
    .filter((i) => i.status === 'accepted')
    .map((i) => ({ id: i.id, accepted_by: i.accepted_by, email: i.email, created_at: i.created_at }))

  const pending: PendingRow[] = (invites ?? [])
    .filter((i) => i.status === 'pending')
    .map((i) => ({ id: i.id, email: i.email, created_at: i.created_at, expires_at: i.expires_at }))

  // Resolve display names for accepted hunters via a single profiles lookup.
  const acceptedIds = accepted.map((a) => a.accepted_by).filter((v): v is string => !!v)
  if (acceptedIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', acceptedIds)
    const map = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))
    accepted.forEach((a) => {
      a.display_name = a.accepted_by ? map.get(a.accepted_by) ?? null : null
    })
  }

  const isEmpty = accepted.length === 0 && pending.length === 0

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="bb-page-eyebrow">Your network</p>
          <h1 className="bb-page-title">Hunters</h1>
          <p className="bb-page-sub">
            Invite hunters by email. Once they accept, you can add them to trips and shared records.
          </p>
        </div>
      </header>

      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <h2 className="bb-section-title" style={{ marginTop: 0 }}>Invite a hunter</h2>
          <InviteForm />
        </div>
      </section>

      {isEmpty ? (
        <div className="bb-empty mt-4">
          <div className="bb-empty-title">No hunters yet</div>
          <p className="bb-empty-sub">
            Invite your first hunter to get started.
          </p>
        </div>
      ) : (
        <>
          {accepted.length > 0 && (
            <section className="mt-4">
              <h2 className="bb-section-title">Your hunters</h2>
              <div className="bb-detail-list">
                {accepted.map((h) => (
                  <div key={h.id} className="bb-detail-row">
                    <div className="bb-avatar" aria-hidden="true">
                      {(h.display_name ?? h.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="bb-detail-name">{h.display_name ?? h.email}</div>
                      <div className="bb-detail-sub">
                        Joined {fmtDate(h.created_at)}{h.display_name ? ` (${h.email})` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="mt-4">
              <h2 className="bb-section-title">Pending invites</h2>
              <div className="bb-detail-list">
                {pending.map((p) => (
                  <div key={p.id} className="bb-detail-row">
                    <div className="bb-avatar" aria-hidden="true">
                      {p.email.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="bb-detail-name">{p.email}</div>
                      <div className="bb-detail-sub">
                        Sent {fmtDate(p.created_at)} (expires {fmtDate(p.expires_at)})
                      </div>
                    </div>
                    <span className="bb-pill bb-pill-planned">Pending</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
