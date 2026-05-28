import { Mail, Users, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import NetworkPersonCard from '../_components/NetworkPersonCard'
import InviteForm from './InviteForm'
import ResendInviteButton from './ResendInviteButton'
import CancelInviteButton from './CancelInviteButton'
import CopyLinkButton from './CopyLinkButton'
import RemoveHunterButton from './RemoveHunterButton'

// v28.1.0e.1 — Hunters list, factored out of /app/hunters/page.tsx so
// the same view renders inside /app/network?tab=hunters for outfitter
// members. Owns the supabase fetch keyed on contextGuideId (= owner
// for outfitter admins, = self for pure guides).
//
// `searchActionPath` controls where the search form posts back to,
// so the form keeps the visitor on whichever route they came from
// (/app/hunters for pure guides, /app/network for outfitter members).

type AcceptedRow = {
  id: string
  accepted_by: string | null
  email: string | null
  created_at: string
  display_name?: string | null
}
type PendingRow = {
  id: string
  email: string | null
  kind: string
  token: string
  created_at: string
  expires_at: string
  last_sent_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function HuntersListView({
  contextGuideId,
  query,
  searchActionPath,
  hiddenSearchFields = {},
  showMobileInviteCard = true,
}: {
  contextGuideId: string
  query: string
  searchActionPath: string
  hiddenSearchFields?: Record<string, string>
  showMobileInviteCard?: boolean
}) {
  const supabase = await createClient()

  const { data: invites } = await supabase
    .from('invitations')
    .select('id, email, status, accepted_by, created_at, expires_at, last_sent_at, token, kind')
    .eq('guide_id', contextGuideId)
    .order('created_at', { ascending: false })

  const accepted: AcceptedRow[] = (invites ?? [])
    .filter((i) => i.status === 'accepted')
    .map((i) => ({ id: i.id, accepted_by: i.accepted_by, email: i.email, created_at: i.created_at }))

  const pending: PendingRow[] = (invites ?? [])
    .filter((i) => i.status === 'pending')
    .map((i) => ({
      id: i.id,
      email: i.email,
      kind: i.kind,
      token: i.token,
      created_at: i.created_at,
      expires_at: i.expires_at,
      last_sent_at: i.last_sent_at,
    }))

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

  const filteredAccepted = query
    ? accepted.filter((a) => {
        const needle = query.toLowerCase()
        return (
          (a.email ?? '').toLowerCase().includes(needle) ||
          (a.display_name ?? '').toLowerCase().includes(needle)
        )
      })
    : accepted

  return (
    <>
      {showMobileInviteCard && (
        <section className="bb-net-card bb-net-invite mt-4 bb-hunters-mobile-invite">
          <InviteForm />
        </section>
      )}

      <form
        method="get"
        role="search"
        aria-label="Search hunters"
        className="bb-hunter-search mt-4"
        action={searchActionPath}
      >
        {Object.entries(hiddenSearchFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <span className="bb-hunter-search-icon" aria-hidden="true">
          <Search size={16} />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search hunters by name or email"
          className="bb-hunter-search-input"
          aria-label="Search hunters"
        />
      </form>

      <div className="bb-hunters-grid mt-4">
        <section>
          <div className="bb-net-section-head">
            <span className="bb-net-section-icon" aria-hidden="true">
              <Users size={14} />
            </span>
            <span className="bb-net-section-title">
              Your hunters
              {query && (
                <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 6 }}>
                  ({filteredAccepted.length} of {accepted.length})
                </span>
              )}
            </span>
          </div>

          {filteredAccepted.length === 0 ? (
            <div className="bb-empty">
              <div className="bb-empty-title">
                {query ? 'No matches' : 'No hunters yet'}
              </div>
              <p className="bb-empty-sub">
                {query
                  ? 'Try a different name or email.'
                  : 'Invite your first hunter to get started.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredAccepted.map((h) => {
                const label = h.display_name ?? h.email ?? 'Hunter'
                return (
                  <NetworkPersonCard
                    key={h.id}
                    avatarLetter={label.slice(0, 1).toUpperCase()}
                    name={label}
                    sub={`Joined ${fmtDate(h.created_at)}${h.display_name && h.email ? ` (${h.email})` : ''}`}
                    action={
                      <RemoveHunterButton
                        inviteId={h.id}
                        displayName={h.display_name ?? null}
                        email={h.email ?? ''}
                      />
                    }
                  />
                )
              })}
            </div>
          )}
        </section>

        <aside className="bb-hunters-grid-aside bb-col-divider">
          <div className="bb-net-section-head">
            <span className="bb-net-section-icon" aria-hidden="true">
              <Mail size={14} />
            </span>
            <span className="bb-net-section-title">
              Pending invites
              <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 6 }}>
                ({pending.length})
              </span>
            </span>
          </div>
          {pending.length === 0 ? (
            <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
              No pending invites, all caught up.
            </p>
          ) : (
            <div className="bb-detail-list">
              {pending.map((p) => {
                const isLink = p.kind === 'link' || !p.email
                const avatar = isLink ? '↗' : (p.email ?? '?').slice(0, 1).toUpperCase()
                const label = isLink ? 'Share link invite' : p.email!
                return (
                  <div key={p.id} className="bb-detail-row bb-detail-row-pending">
                    <div className="bb-avatar" aria-hidden="true">
                      {avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="bb-detail-name">{label}</div>
                      <div className="bb-detail-sub">
                        {isLink ? 'Created' : 'Sent'} {fmtDate(p.created_at)} (expires {fmtDate(p.expires_at)})
                      </div>
                    </div>
                    <span className="bb-pill bb-pill-planned">{isLink ? 'Multi-use' : 'Pending'}</span>
                    <div className="bb-resend-wrap">
                      <CopyLinkButton token={p.token} />
                      {!isLink && p.email && (
                        <ResendInviteButton
                          inviteId={p.id}
                          email={p.email}
                          lastSentAt={p.last_sent_at}
                        />
                      )}
                      <CancelInviteButton inviteId={p.id} email={p.email ?? 'this link'} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
