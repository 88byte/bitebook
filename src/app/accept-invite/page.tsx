import Link from 'next/link'
import AcceptInviteForm from './AcceptInviteForm'
import DarkHero from '@/components/DarkHero'
import Footer from '@/components/Footer'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: 'Welcome to Bite Book — set your password' }

type InviteState =
  | { ok: true; email: string; token: string; guideName: string }
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
    email: invite.email,
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
    <main className="flex flex-col min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <DarkHero tagline={<p className="bb-tagline-static">You&rsquo;re in the book.</p>} />

      <section className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-sm bb-fade-up" style={{ animationDelay: '0.15s' }}>
          {invite.ok ? (
            <>
              <h1 className="text-center text-2xl mb-1" style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}>
                Welcome to Bite Book
              </h1>
              <p className="text-center text-xs mb-5" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
                {invite.guideName} invited you. Set a password to get started.
              </p>
              <AcceptInviteForm token={invite.token} email={invite.email} />
            </>
          ) : (
            <ErrorCard reason={invite.reason} />
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}

function ErrorCard({ reason }: { reason: 'invalid' | 'expired' | 'used' | 'misconfigured' }) {
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
      body: <>You&rsquo;re already set up — head to <Link href="/login" className="underline" style={{ color: 'var(--color-accent)' }}>sign in</Link>.</>,
    },
    misconfigured: {
      title: 'Bite Book isn&rsquo;t finished setting up',
      body: <>The admin keys for invite acceptance aren&rsquo;t configured yet. Email <a className="underline" style={{ color: 'var(--color-accent)' }} href="mailto:support@lastbite.pro">support@lastbite.pro</a> and we&rsquo;ll fix it fast.</>,
    },
  }
  const { title, body } = copy[reason]
  return (
    <div className="text-center">
      <p className="font-bold text-sm mb-2" style={{ color: 'var(--color-ink)' }}>{title}</p>
      <p className="text-xs" style={{ color: 'var(--color-ink)', opacity: 0.7 }}>{body}</p>
    </div>
  )
}
