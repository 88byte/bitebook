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
//
// v27.9.1 — when the invite carries a trip_id, also surface a trip
// preview chip above the form (date + state + species) so the hunter
// knows what they're signing up for.
type TripPreview = {
  title: string
  starts_at: string | null
  state: string | null
  species_targeted: string | null
}
type InviteState =
  | { ok: true; email: string | null; token: string; guideName: string; trip: TripPreview | null }
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
    .select('id, email, status, expires_at, guide_id, trip_id')
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

  // v27.9.1 — trip preview load (only when invite carries a trip_id).
  // If the trip is canceled/completed, surface as 'expired' so the
  // hunter sees the friendly "no longer accepting" message instead
  // of submitting a form that will fail server-side.
  let trip: TripPreview | null = null
  if (invite.trip_id) {
    const { data: tripRow } = await admin
      .from('trips')
      .select('title, starts_at, state, species_targeted, status')
      .eq('id', invite.trip_id)
      .maybeSingle()
    if (!tripRow || tripRow.status === 'canceled' || tripRow.status === 'completed') {
      return { ok: false, reason: 'expired' }
    }
    trip = {
      title: tripRow.title,
      starts_at: tripRow.starts_at,
      state: tripRow.state,
      species_targeted: tripRow.species_targeted,
    }
  }

  return {
    ok: true,
    email: invite.email, // may be null for link-mode invites
    token,
    guideName: guide?.business_name || 'your guide',
    trip,
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
            <>
              {invite.trip && <TripPreviewChip trip={invite.trip} />}
              <AcceptInviteForm token={invite.token} email={invite.email} />
            </>
          ) : (
            <ErrorBlock reason={invite.reason} />
          )}
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}

// v27.9.1 — trip preview chip above the accept form. Renders a compact
// summary (date · state · species) so the hunter knows what they're
// signing up for before they fill in their details. Only rendered when
// the invitation has a non-null trip_id.
function TripPreviewChip({ trip }: { trip: TripPreview }) {
  const dateStr = trip.starts_at
    ? new Date(trip.starts_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null
  const parts = [dateStr, trip.state, trip.species_targeted].filter(Boolean) as string[]
  return (
    <div
      style={{
        marginBottom: '0.85rem',
        padding: '0.7rem 0.85rem',
        borderRadius: 10,
        background: 'rgba(176, 108, 60, 0.10)',
        border: '1px solid rgba(176, 108, 60, 0.32)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 700,
          fontSize: '0.72rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-copper)',
        }}
      >
        You&rsquo;re joining a trip
      </p>
      <p
        style={{
          margin: '0.15rem 0 0',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: 'var(--color-ink)',
        }}
      >
        {trip.title}
      </p>
      {parts.length > 0 && (
        <p
          style={{
            margin: '0.1rem 0 0',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.82rem',
            color: 'var(--color-ink-muted)',
          }}
        >
          {parts.join(' · ')}
        </p>
      )}
    </div>
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
