import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGuideTier } from '@/app/app/_lib/billing-tier'
import { markStepDone } from '@/app/app/_lib/onboarding'

// v27.1.5.0 — onboarding consolidation. The accept-invite route now also
// captures address + license + (optional) tag in the same submit.
// Wallet items are inserted via the admin client because the new auth
// user isn't signed in yet at the time this runs (sign-in happens on the
// client side after a 200 response).
//
// v27.1.5.0.1 — the v27.1.5.0 auto-link block has been removed. See the
// comment near the end of POST() for the rationale. Wallet items are
// created here, but linking them to any specific trip is the per-trip
// ActionNeededCard's job.

type AddressBody = {
  street?: string
  city?: string
  state?: string
  zip?: string
}

type LicenseBody = {
  identifier?: string
  state?: string
  issue_date?: string | null
  valid_to?: string
}

type TagBody = {
  identifier?: string
  species?: string
  state?: string
  zone?: string | null
  season_year?: number | null
  valid_to?: string
}

type Body = {
  token?: string
  password?: string
  displayName?: string
  firstName?: string
  lastName?: string
  phone?: string | null
  // v27.8.2.1 — link-mode invites: hunter-supplied email. Optional;
  // when present we use it as the createUser email AND write it back
  // to invitations.email at acceptance.
  email?: string
  address?: AddressBody
  license?: LicenseBody | null
  tag?: TagBody | null
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { token, password, displayName, firstName, lastName, phone, email: bodyEmail, address, license, tag } = body
  if (!token || !password || !displayName || !firstName || !lastName) {
    return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (!address?.street || !address?.city || !address?.state || !address?.zip) {
    return NextResponse.json({ error: 'Address is incomplete.' }, { status: 400 })
  }
  if (license) {
    if (!license.identifier || !license.state || !license.valid_to) {
      return NextResponse.json({ error: 'License section is incomplete.' }, { status: 400 })
    }
  }
  if (tag) {
    if (!tag.identifier || !tag.species || !tag.state || !tag.valid_to) {
      return NextResponse.json({ error: 'Tag section is incomplete.' }, { status: 400 })
    }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data: invite } = await admin
    .from('invitations')
    .select('id, email, status, expires_at, guide_id, kind')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
  if (invite.status === 'accepted') return NextResponse.json({ error: 'Invite already used.' }, { status: 409 })
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Invite revoked.' }, { status: 410 })
  if (invite.status === 'canceled') return NextResponse.json({ error: 'Invite canceled.' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from('invitations').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'Invite expired.' }, { status: 410 })
  }

  // v27.8.2.1 — resolve the email used to create the auth account.
  //
  //   • Email-mode (invite.email is set): use the locked invite email.
  //     Body-supplied email is ignored — this is defense-in-depth so a
  //     hunter can't claim a different email on an email-mode invite.
  //   • Link-mode (invite.email is null, invite.kind === 'link'):
  //     require the body to supply a valid email. We also reject if any
  //     existing auth user already has that email (to mirror the
  //     duplicate-email guard in inviteHunterAction).
  let finalEmail: string
  if (invite.email) {
    finalEmail = invite.email.toLowerCase()
  } else {
    const supplied = (bodyEmail ?? '').trim().toLowerCase()
    if (!supplied || !EMAIL_RX.test(supplied)) {
      return NextResponse.json(
        { error: 'Please enter a valid email to accept this invite.' },
        { status: 400 },
      )
    }
    // Duplicate-email guard. Pre-existing Bite Book accounts can't
    // re-register through the link flow — they should just sign in. The
    // page shows a clear "Already have an account? Sign in" link below
    // the form, so we surface a focused error here and let them click
    // through.
    const MAX_PAGES = 5
    const PER_PAGE = 1000
    let collision = false
    for (let page = 1; page <= MAX_PAGES && !collision; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
      if (listErr) {
        console.warn('[accept-invite.listUsers]', { code: listErr.code, message: listErr.message })
        break
      }
      const users = list?.users ?? []
      collision = users.some((u) => (u.email ?? '').toLowerCase() === supplied)
      if (users.length < PER_PAGE) break
    }
    if (collision) {
      return NextResponse.json(
        {
          error:
            'That email already has a Bite Book account. Sign in there instead, or use a different email to accept this invite.',
        },
        { status: 409 },
      )
    }
    finalEmail = supplied
  }

  // v27.4.3 — block accept-invite when the inviting guide's subscription
  // has lapsed. The invite link can be days/weeks old; the guide may
  // have canceled or fallen into past_due since they sent it. A hunter
  // who creates a Bite Book account for a guide that's no longer active
  // would land on an empty dashboard with no clear path forward, so we
  // refuse the signup and tell them to reach out to the guide. We
  // tolerate the inviting guide being read_only OR locked; the only
  // tier that lets accept proceed is 'full'.
  const guideTier = await getGuideTier(invite.guide_id)
  if (guideTier.tier !== 'full') {
    return NextResponse.json(
      {
        error:
          "This invite is from a guide whose Bite Book account is no longer active. Please reach out to your guide directly — once they restart their subscription, they can resend the invite.",
      },
      { status: 410 },
    )
  }

  // Create the auth user with the chosen password, email pre-confirmed.
  // v27.8.2.1 — uses finalEmail (locked invite.email for email-mode,
  // hunter-supplied for link-mode).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: finalEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, invited_by: invite.guide_id },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Could not create account.' }, { status: 500 })
  }

  const userId = created.user.id

  // Profile (role=hunter) + expanded fields. Upsert in case a trigger
  // already wrote a thin row.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        address_street: address.street,
        address_city: address.city,
        address_state: address.state,
        address_zip: address.zip,
        role: 'hunter',
      },
      { onConflict: 'id' }
    )
  if (profileErr) {
    return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 500 })
  }

  // v27.8.1.2 — mark `profile_set` done now. Flavio testing v27.8.1.1:
  // hunter completes accept-invite (which captures display + first +
  // last + 4-part address — every gating field for `profile_set`),
  // signs in, lands on the dashboard, sees a "Finish setting up" banner
  // pointing them at /app/h/welcome → /app/h/profile to RE-FILL the
  // exact data they just submitted. Net experience: redundant five
  // minutes of busy-work that "felt broken." Fix: stamp the step here,
  // best-effort. The form earlier in the route already validates every
  // required field for the step, so the gate is implicit. wait_for_guide
  // is data-derived from invitations.accepted_by (set below) so it's
  // covered automatically. first_trip_viewed correctly stays for the
  // trip-detail page to mark on real first view.
  try {
    await markStepDone(admin, userId, 'profile_set')
  } catch (e) {
    console.warn('[accept-invite.markStepDone profile_set]', { userId, error: (e as Error).message })
  }

  // Wallet items (license + optional tag). Track inserted ids so we can
  // auto-link them to any open trips the hunter is already on.
  const insertedWalletItemIds: string[] = []

  if (license) {
    const { data: licRow, error: licErr } = await admin
      .from('wallet_items')
      .insert({
        user_id: userId,
        type: 'license',
        jurisdiction: 'state',
        identifier: license.identifier!,
        state: license.state!,
        issue_date: license.issue_date ?? null,
        valid_from: license.issue_date ?? new Date().toISOString().slice(0, 10),
        valid_to: license.valid_to!,
      })
      .select('id')
      .single()
    if (licErr) {
      console.warn('[accept-invite.license]', { code: licErr.code, message: licErr.message })
    } else if (licRow) {
      insertedWalletItemIds.push(licRow.id)
    }
  }

  if (tag) {
    const { data: tagRow, error: tagErr } = await admin
      .from('wallet_items')
      .insert({
        user_id: userId,
        type: 'tag',
        jurisdiction: 'state',
        identifier: tag.identifier!,
        species: tag.species!,
        state: tag.state!,
        zone: tag.zone ?? null,
        season_year: tag.season_year ?? null,
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: tag.valid_to!,
      })
      .select('id')
      .single()
    if (tagErr) {
      console.warn('[accept-invite.tag]', { code: tagErr.code, message: tagErr.message })
    } else if (tagRow) {
      insertedWalletItemIds.push(tagRow.id)
    }
  }

  // v27.1.5.0.1 — auto-link removed. Earlier in v27.1.5.0 we attempted
  // a defense-in-depth pass that linked any newly-created wallet items
  // to every open trip the hunter happened to be on. That was too
  // aggressive: a hunter invited to multiple trips would get one
  // license auto-linked to all of them; a CA license could end up
  // attached to a CO trip; multiple tags would all attach to every
  // trip regardless of species.
  //
  // The right scope is trip-specific auto-link, but `invitations` does
  // NOT carry a `trip_id` column (confirmed against current schema —
  // only id, email, status, expires_at, guide_id, token, created_at,
  // last_sent_at, accepted_by are present). Until a future migration
  // adds `invitations.trip_id` and the InviteForm captures it on
  // trip-detail-originated invites, every invite is treated as
  // network-only and the hunter links per-trip via the trip detail's
  // ActionNeededCard. The card already auto-finds matching wallet
  // items via fetchHunterMatchingWalletItems(state) so the per-trip
  // link is a one-tap operation, not a separate flow.

  // Mark invite accepted. v27.8.2.1 — for link-mode invites we also
  // stamp the hunter-supplied email back onto the row so future audit
  // queries (and the guide's pending/accepted views) show the actual
  // email of record. For email-mode invites this is a no-op write of
  // the same value.
  await admin
    .from('invitations')
    .update({ status: 'accepted', accepted_by: userId, email: finalEmail })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
