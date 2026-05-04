import { Mail, Users } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import DashboardHero from '../_components/DashboardHero'
import NetworkPersonCard from '../_components/NetworkPersonCard'
import InviteForm from './InviteForm'
import ResendInviteButton from './ResendInviteButton'
import CancelInviteButton from './CancelInviteButton'
import RemoveHunterButton from './RemoveHunterButton'

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
  last_sent_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// v27.0a.12: Hunters page (guide-side) rebuilt to Flavio's mockup. Hero
// banner reuses the dashboard image. Invite-a-hunter card has copper-circle
// Mail icon header + icon-prefixed input + full-width copper Send Invite
// button. Hunter cards use the new NetworkPersonCard with big avatar +
// mountains watermark + bottom-right Remove action. Pending invites keep
// the existing legacy row layout — they're transient and don't need the
// hero-card treatment.
export default async function HuntersPage() {
  const { profile } = await requireGuide()
  const supabase = await createClient()

  const { data: invites } = await supabase
    .from('invitations')
    .select('id, email, status, accepted_by, created_at, expires_at, last_sent_at')
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

  return (
    <main className="bb-app-main">
      <DashboardHero
        eyebrow="Your network"
        title="Hunters"
        subtitle="Invite hunters by email. Once they accept, you can add them to trips and shared records."
        bgImage="/bb-network-hero.png"
        eyebrowColor="copper"
        showShield={false}
        objectPosition="center 28%"
      />

      {/* v27.3.2 — Hunters layout pass. Mobile stacks (Invite card,
          then Your hunters, then Pending invites). On desktop the
          Invite card becomes a sticky right-rail aside so it's always
          in view while the guide scrolls their roster. */}
      <div className="bb-hunters-grid mt-4">
        <div className="flex flex-col gap-4">
          <section>
            <div className="bb-net-section-head">
              <span className="bb-net-section-icon" aria-hidden="true">
                <Users size={14} />
              </span>
              <span className="bb-net-section-title">Your hunters</span>
            </div>

            {accepted.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No hunters yet</div>
                <p className="bb-empty-sub">Invite your first hunter to get started.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {accepted.map((h) => {
                  const label = h.display_name ?? h.email
                  return (
                    <NetworkPersonCard
                      key={h.id}
                      avatarLetter={label.slice(0, 1).toUpperCase()}
                      name={label}
                      sub={`Joined ${fmtDate(h.created_at)}${h.display_name ? ` (${h.email})` : ''}`}
                      action={
                        <RemoveHunterButton
                          inviteId={h.id}
                          displayName={h.display_name ?? null}
                          email={h.email}
                        />
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>

          {pending.length > 0 && (
            <section>
              <div className="bb-net-section-head">
                <span className="bb-net-section-icon" aria-hidden="true">
                  <Mail size={14} />
                </span>
                <span className="bb-net-section-title">Pending invites</span>
              </div>
              <div className="bb-detail-list">
                {pending.map((p) => (
                  <div key={p.id} className="bb-detail-row bb-detail-row-pending">
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
                    <div className="bb-resend-wrap">
                      <ResendInviteButton
                        inviteId={p.id}
                        email={p.email}
                        lastSentAt={p.last_sent_at}
                      />
                      <CancelInviteButton inviteId={p.id} email={p.email} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="bb-hunters-grid-aside">
          <section className="bb-net-card bb-net-invite">
            <div className="bb-net-invite-head">
              <span className="bb-net-invite-icon" aria-hidden="true">
                <Mail size={20} />
              </span>
              <h2 className="bb-net-invite-title">Invite a hunter</h2>
            </div>
            <InviteForm />
          </section>
        </aside>
      </div>
    </main>
  )
}
