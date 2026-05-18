import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import AcceptInviteButton from './AcceptInviteButton'

// v28.1.0c — Accept page for outfitter admin invites.
//
// Server-renders the invite metadata + branches on auth state:
//   • valid + signed in       → org snapshot + "Accept invite" CTA
//   • valid + not signed in   → "Sign in or create account" prompt
//   • invalid / expired       → clean error with link back to /login

type SP = Promise<{ token?: string }>

export default async function AcceptAdminInvitePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const token = (sp.token || '').trim()

  if (!token) {
    return <InvalidView reason="missing_token" />
  }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('outfitter_admin_invites')
    .select('id, org_id, invited_email, status, expires_at, invited_by_profile_id')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return <InvalidView reason="not_found" />
  if (invite.status === 'revoked') return <InvalidView reason="revoked" />
  if (invite.status === 'accepted') return <InvalidView reason="accepted" />
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return <InvalidView reason="expired" />
  }

  // Org + owner info for the prompt.
  const { data: org } = await admin
    .from('outfitter_orgs')
    .select('id, name, owner_profile_id')
    .eq('id', invite.org_id)
    .maybeSingle()
  if (!org) return <InvalidView reason="not_found" />

  let ownerName = 'The outfitter owner'
  try {
    const { data: ownerProf } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', org.owner_profile_id)
      .maybeSingle()
    if (ownerProf?.display_name) ownerName = ownerProf.display_name
  } catch {/* ignore */}

  // Are they signed in?
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  // Already a member of this org? Skip ahead.
  if (user) {
    const { data: existingMember } = await admin
      .from('outfitter_org_members')
      .select('id')
      .eq('org_id', org.id)
      .eq('profile_id', user.id)
      .is('removed_at', null)
      .maybeSingle()
    if (existingMember?.id) {
      // They're already on this org; bounce to dashboard.
      redirect('/app')
    }
  }

  return (
    <main className="bb-app-main">
      <div className="bb-form-narrow" style={{ marginTop: '1rem' }}>
        <header>
          {/* v28.1.0c.2 — Force light copy. The /accept-admin-invite
              route sits outside /app's layout, which means the default
              ink-on-dark contrast wasn't applying — title was rendering
              in dark ink against the dark page-bg. */}
          <p className="bb-page-eyebrow" style={{ color: 'var(--color-copper)' }}>Admin invite</p>
          <h1 className="bb-page-title" style={{ color: '#FAF7F2' }}>
            {ownerName} invited you to manage {org.name}
          </h1>
          <p className="bb-page-sub" style={{ color: '#FAF7F2', opacity: 0.85 }}>
            Admins can manage trips, the guide network, and hunters across the org. No subscription required.
          </p>
        </header>

        <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
          <div className="bb-tile-body">
            <p className="bb-form-help" style={{ marginTop: 0 }}>
              Invited email: <strong>{invite.invited_email}</strong>
            </p>

            {!user ? (
              <>
                <p style={{ margin: '0.75rem 0' }}>
                  Sign in or create a free Bite Book account to accept this invite.
                  We&rsquo;ll bring you right back here.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <Link
                    href={`/login?next=${encodeURIComponent(`/accept-admin-invite?token=${token}`)}`}
                    className="bb-cta-sm"
                  >
                    Sign in
                  </Link>
                  {/* v28.1.0c.2 — Admin seats are free. The default /signup
                      flow drops users into the paid guide-Stripe path, which
                      is wrong here — admins are covered by the outfitter's
                      sub. Route to a dedicated free-signup form that calls
                      signupAndAcceptOutfitterAdminInviteAction. */}
                  <Link
                    href={`/accept-admin-invite/signup?token=${encodeURIComponent(token)}`}
                    className="bb-btn-secondary"
                  >
                    Create account
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0.75rem 0' }}>
                  Signed in as <strong>{user.email}</strong>. Click below to accept.
                </p>
                <AcceptInviteButton token={token} />
              </>
            )}
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
          <p className="bb-page-eyebrow">Admin invite</p>
          <h1 className="bb-page-title">Invite unavailable</h1>
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
