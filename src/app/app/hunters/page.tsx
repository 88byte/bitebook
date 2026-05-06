import { Mail, Users, Search } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import DashboardHero from '../_components/DashboardHero'
import NetworkPersonCard from '../_components/NetworkPersonCard'
import InviteForm from './InviteForm'
import ResendInviteButton from './ResendInviteButton'
import CancelInviteButton from './CancelInviteButton'
import CopyLinkButton from './CopyLinkButton'
import RemoveHunterButton from './RemoveHunterButton'

type AcceptedRow = {
  id: string
  accepted_by: string | null
  email: string | null
  created_at: string
  display_name?: string | null
}
// v27.8.2.1 — `email` is nullable; link-mode invites carry email=null
// until acceptance. `kind` distinguishes 'email' vs 'link'.
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

// v27.3.2.1 — Hunters page redesign per Flavio:
//   1. Invite-a-hunter card at TOP (above the list)
//   2. Search bar BELOW the invite section
//   3. Hunter cards BELOW the search
//   4. Pending invites in a SECOND COLUMN on desktop (right rail aside)
// Mobile stacks everything single-col. Server-side search filters by
// display_name + email (case-insensitive contains).
export default async function HuntersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { profile } = await requireGuide()
  const supabase = await createClient()
  const { q: rawQ } = await searchParams
  const query = (rawQ ?? '').trim()

  const { data: invites } = await supabase
    .from('invitations')
    .select('id, email, status, accepted_by, created_at, expires_at, last_sent_at, token, kind')
    .eq('guide_id', profile.id)
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

  // v27.3.2.1: client-side filter for the search bar. Hunters list
  // is small (almost always <100 rows for a single guide), so a
  // simple JS contains-match on display_name + email beats hauling
  // up a real full-text index.
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
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Your network"
        title="Hunters"
        subtitle="Invite hunters by email. Once they accept, you can add them to trips and shared records."
        bgImage="/banners/hunter-hero.png"
        eyebrowColor="copper"
        showShield={false}
        objectPosition="top"
        rightSlot={<InviteForm compact />}
      />

      {/* v27.3.2.1: page divider — same border-style as docs/trips
          tab strips, applied here because Hunters has no tab strip
          to provide that visual separation between header chrome
          and content. */}
      <div className="bb-page-divider mt-4" aria-hidden="true" />

      {/* v27.3.3.2 — Hunters redesign:
          • DESKTOP (>=1024px): invite form lives in the banner right
            slot; this body card is hidden via .bb-hunters-mobile-invite.
          • MOBILE (<1024px): banner slot is hidden, this card carries
            the invite form. Same flow, different placement. */}
      <section className="bb-net-card bb-net-invite mt-4 bb-hunters-mobile-invite">
        <div className="bb-net-invite-head">
          <span className="bb-net-invite-icon" aria-hidden="true">
            <Mail size={20} />
          </span>
          <h2 className="bb-net-invite-title">Invite a hunter</h2>
        </div>
        <InviteForm />
      </section>

      <form
        method="get"
        role="search"
        aria-label="Search hunters"
        className="bb-hunter-search mt-4"
      >
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
                // v27.8.2.1 — link-mode invites land here too once
                // accepted. We backfill invitations.email with the
                // hunter-supplied email at acceptance time, so by the
                // time a row is in `accepted` we always have an email.
                // The fallback to display_name covers the legacy
                // pre-name path.
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
              No pending invites — all caught up.
            </p>
          ) : (
            <div className="bb-detail-list">
              {pending.map((p) => {
                // v27.8.2.1 — link-mode invites have no email until
                // accepted. Show "Share link invite" + a link icon
                // avatar; resend button is hidden because there's no
                // recipient to email yet. CopyLink + Cancel still apply.
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
                    <span className="bb-pill bb-pill-planned">Pending</span>
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
    </main>
  )
}
