import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// v27.1.5.0 — onboarding consolidation. The accept-invite route now also
// captures address + license + (optional) tag in the same submit.
// Wallet items are inserted via the admin client because the new auth
// user isn't signed in yet at the time this runs (sign-in happens on the
// client side after a 200 response).
//
// Defense-in-depth: if the new hunter is somehow already on any open
// trips at acceptance time (rare — the typical flow is invite → accept →
// guide adds to trip), auto-create trip_wallet_items linkages on the
// spot so the trip detail's ActionNeededCard sees the items as already
// linked instead of asking the hunter to manually attach them.

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
  address?: AddressBody
  license?: LicenseBody | null
  tag?: TagBody | null
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { token, password, displayName, firstName, lastName, phone, address, license, tag } = body
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
    .select('id, email, status, expires_at, guide_id')
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

  // Create the auth user with the chosen password, email pre-confirmed.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
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

  // Defense-in-depth auto-link: if the hunter happens to be on any open
  // trips (planned/active) at this moment, attach the freshly-created
  // wallet items so the trip detail shows them as already linked.
  // Typical flow has this set empty (guide adds the hunter post-accept).
  if (insertedWalletItemIds.length > 0) {
    try {
      const { data: openTrips } = await admin
        .from('trip_participants')
        .select('trip_id, trip:trips!inner(id, status)')
        .eq('hunter_id', userId)
        .in('trip.status', ['planned', 'active'])
      const tripIds = ((openTrips ?? []) as Array<{ trip_id: string; trip: { status: string } | null }>)
        .filter((r) => r.trip && (r.trip.status === 'planned' || r.trip.status === 'active'))
        .map((r) => r.trip_id)
      if (tripIds.length > 0) {
        const linkRows = tripIds.flatMap((trip_id) =>
          insertedWalletItemIds.map((wallet_item_id) => ({
            trip_id,
            hunter_id: userId,
            wallet_item_id,
          }))
        )
        const { error: linkErr } = await admin.from('trip_wallet_items').insert(linkRows)
        if (linkErr) {
          console.warn('[accept-invite.autolink]', { code: linkErr.code, message: linkErr.message })
        }
      }
    } catch (e) {
      console.warn('[accept-invite.autolink.crash]', e)
    }
  }

  // Mark invite accepted
  await admin
    .from('invitations')
    .update({ status: 'accepted', accepted_by: userId })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
