import Link from 'next/link'
import AcceptInviteForm from './AcceptInviteForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import Footer from '@/components/Footer'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: 'Welcome to Bite Book — set your password' }

// v27.8.2.1 — link-mode invites have email=NULL until acceptance. The
// accept-invite form treats `email: null` as "ask the hunter for it"
// and writes back to the invitations row at /api/accept-invite. Pre-
// v27.8.2.1 every invite carried a locked email and the form rendered
// it as readOnly.
type InviteState =
  | { ok: true; email: string | null; token: string; guideName: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'misconfigured' }

async function loadInvite(token: string | undefined): Promise<InviteState> {
  if (!token) return { ok: false, reason: 'invalid' }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, reason: 'misconfigured' }
  }

  const { data: invite } = await admin
    .from('invitations')
    .select('id, email, status, expires_at, guide_id')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return { ok: false, reason: 'invalid' }
  if (invite.status === 'accepted') return { ok: false, reason: 'used' }
  if (invite.status === 'revoked') return { ok: false, reason: 'invalid' }
  if (new Date(invite.expires_at) < new Date()) return { ok: false, reason: 'expired' }

  const { data: guide } = await admin
    .from('guide_profiles')
    .select('business_name')
    .eq('user_id', invite.guide_id)
    .maybeSingle()

  return {
    ok: true,
    email: invite.email, // may be null for link-mode invites
    token,
    guideName: guide?.business_name || 'your guide',
  }
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const invite = await loadInvite(token)

  return (
    <main className="flex flex-col min-h-screen">
      <Hero
        taglineLine1="You&rsquo;re in the book."
        subtitle={
          invite.ok
            ? `${invite.guideName} invited you. Set a password to get started.`
            : 'Set a password to get started.'
        }
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Set up account">
          {invite.ok ? (
            <AcceptInviteForm token={invite.token} email={invite.email} />
          ) : (
            <ErrorBlock reason={invite.reason} />
          )}
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}

function ErrorBlock({ reason }: { reason: 'invalid' | 'expired' | 'used' | 'misconfigured' }) {
  const copy: Record<typeof reason, { title: string; body: React.ReactNode }> = {
    invalid: {
      title: 'Invite link not found',
      body: <>This link doesn&rsquo;t look right. Ask your guide to send you a new invite.</>,
    },
    expired: {
      title: 'This invite has expired',
      body: <>Invites are good for 7 days. Ask your guide to send you a fresh one.</>,
    },
    used: {
      title: 'This invite was already used',
      body: <>You&rsquo;re already set up — head to <Link href="/login" className="underline" style={{ color: 'var(--color-copper)' }}>sign in</Link>.</>,
    },
    misconfigured: {
      title: 'Bite Book isn&rsquo;t finished setting up',
      body: <>The admin keys for invite acceptance aren&rsquo;t configured yet. Email <a className="underline" style={{ color: 'var(--color-copper)' }} href="mailto:support@lastbite.pro">support@lastbite.pro</a> and we&rsquo;ll fix it fast.</>,
    },
  }
  const { title, body } = copy[reason]
  return (
    <div className="text-center">
      <p className="font-bold text-sm mb-2" style={{ color: 'var(--color-ink)' }}>{title}</p>
      <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{body}</p>
    </div>
  )
}
