import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminInviteSignupForm from './AdminInviteSignupForm'

// v28.1.0c.2 — Free signup path for outfitter admin invitees. Admin
// seats are covered by the org's subscription, NOT a guide sub. This
// route deliberately bypasses /signup (which is the paid-guide flow)
// so invitees never hit Stripe.
//
// Server-validates the token before rendering the form. Invalid /
// expired tokens get a clean error view + link back to /login.

type SP = Promise<{ token?: string }>

export default async function AdminInviteSignupPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const token = (sp.token || '').trim()

  if (!token) return <InvalidView reason="missing_token" />

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('outfitter_admin_invites')
    .select('id, org_id, invited_email, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!invite) return <InvalidView reason="not_found" />
  if (invite.status === 'revoked') return <InvalidView reason="revoked" />
  if (invite.status === 'accepted') return <InvalidView reason="accepted" />
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return <InvalidView reason="expired" />
  }

  const { data: org } = await admin
    .from('outfitter_orgs')
    .select('name')
    .eq('id', invite.org_id)
    .maybeSingle()
  const orgName = org?.name ?? 'this outfitter'

  return (
    <main className="bb-app-main">
      <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
        <div className="mb-3">
          <Link
            href={`/accept-admin-invite?token=${encodeURIComponent(token)}`}
            className="bb-text-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#FAF7F2' }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to invite
          </Link>
        </div>
        <header>
          <p className="bb-page-eyebrow" style={{ color: 'var(--color-copper)' }}>Admin invite</p>
          <h1 className="bb-page-title" style={{ color: '#FAF7F2' }}>Create your free admin account</h1>
          <p className="bb-page-sub" style={{ color: '#FAF7F2', opacity: 0.85 }}>
            Joining <strong>{orgName}</strong> as an admin. No subscription required — your seat is
            covered by the outfitter.
          </p>
        </header>

        <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
          <div className="bb-tile-body">
            <AdminInviteSignupForm
              token={token}
              invitedEmail={invite.invited_email}
              orgName={orgName}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function InvalidView({ reason }: { reason: 'missing_token' | 'not_found' | 'revoked' | 'accepted' | 'expired' }) {
  const copy = (() => {
    switch (reason) {
      case 'missing_token': return 'No invite token was provided.'
      case 'not_found': return 'This invite is invalid or no longer exists.'
      case 'revoked': return 'This invite has been revoked by the org owner.'
      case 'accepted': return 'This invite has already been accepted.'
      case 'expired': return 'This invite has expired. Ask the org owner to send a new one.'
    }
  })()
  return (
    <main className="bb-app-main">
      <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
        <header>
          <p className="bb-page-eyebrow" style={{ color: 'var(--color-copper)' }}>Admin invite</p>
          <h1 className="bb-page-title" style={{ color: '#FAF7F2' }}>Invite unavailable</h1>
        </header>
        <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
          <div className="bb-tile-body">
            <p>{copy}</p>
            <p style={{ marginTop: '0.75rem' }}>
              <Link href="/login" className="bb-text-action bb-text-action-copper">Back to sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
