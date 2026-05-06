'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// v27.9.1.1 — accept-invite path for hunters who ALREADY have a Bite
// Book account. Pre-v27.9.1.1, an existing hunter who clicked an invite
// link (signed out, then signed in) was routed through the new-hunter
// signup form, which would 409 / fail at auth.admin.createUser with
// "User already registered." Flavio's spotted gap.
//
// Now: when /accept-invite/page.tsx detects an authenticated session
// AND a valid invite token, it shows a "Confirm and join" button that
// posts to this action. The action:
//   1. Re-validates the token (status, expiry, optional trip status)
//   2. Asserts the caller is a hunter (not a guide; not unset role)
//   3. For trip-scoped invites: inserts trip_participants (idempotent)
//   4. Writes a multi-use acceptance row matching v27.8.4.3 semantics
//      (link templates stay pending; per-acceptance row carries the
//       hunter's email + accepted_by + trip_id forward)
//   5. For email-mode invites: stamps the original row as accepted
//   6. Redirects to /app/h/trips/[id] (trip-scoped) or /app/h
//
// The action runs through the cookie-aware server client so RLS sees
// the right user, then escalates to the service-role admin client for
// the cross-table writes (mirrors /api/accept-invite's pattern).

export type AcceptResult =
  | { ok: true; redirectTo: string }
  | { error: string }

export async function acceptInviteAsExistingUserAction(
  token: string,
): Promise<AcceptResult> {
  if (!token) return { error: 'Missing invite token.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You need to be signed in to accept this invite.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Token validity (mirror /api/accept-invite's gates).
  const { data: invite } = await admin
    .from('invitations')
    .select('id, email, status, expires_at, guide_id, kind, trip_id')
    .eq('token', token)
    .maybeSingle()
  if (!invite) return { error: 'Invite not found.' }
  if (invite.status === 'accepted' && invite.kind !== 'link') {
    return { error: 'This invite was already used.' }
  }
  if (invite.status === 'revoked' || invite.status === 'canceled') {
    return { error: 'This invite is no longer active.' }
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This invite has expired.' }
  }

  // Role check — guides cannot double-role into a hunter slot.
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role === 'guide') {
    return {
      error:
        'Bite Book guides can’t accept hunter invites. Reach out to the guide directly if you want to join their trip.',
    }
  }

  // Trip-scoped invite: re-fetch trip status (in case it canceled
  // between page render and Confirm).
  if (invite.trip_id) {
    const { data: trip } = await admin
      .from('trips')
      .select('id, status')
      .eq('id', invite.trip_id)
      .maybeSingle()
    if (!trip) {
      return { error: 'The trip linked to this invite no longer exists.' }
    }
    if (trip.status === 'canceled' || trip.status === 'completed') {
      return {
        error: 'This trip is no longer accepting hunters. Reach out to your guide for the next one.',
      }
    }

    const { error: tpErr } = await admin
      .from('trip_participants')
      .insert({ trip_id: invite.trip_id, hunter_id: user.id })
    if (tpErr && tpErr.code !== '23505') {
      console.warn('[accept-invite-existing.tripEnroll]', { code: tpErr.code, message: tpErr.message })
      return { error: 'Could not add you to the trip. Try again or reach out to your guide.' }
    }
  }

  // Acceptance row.
  const userEmail = (user.email ?? '').toLowerCase()
  if (invite.kind === 'link') {
    // Multi-use template stays pending; insert a separate acceptance
    // record so the guide's accepted-list query surfaces this hunter.
    await admin.from('invitations').insert({
      guide_id: invite.guide_id,
      email: userEmail,
      accepted_by: user.id,
      status: 'accepted',
      kind: 'link',
      trip_id: invite.trip_id ?? null,
    })
  } else {
    // Email-mode: single-use, flip the original row.
    await admin
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_by: user.id,
        email: userEmail,
      })
      .eq('id', invite.id)
  }

  revalidatePath('/app/h')
  revalidatePath('/app/hunters')
  if (invite.trip_id) {
    revalidatePath(`/app/h/trips/${invite.trip_id}`)
    revalidatePath(`/app/trips/${invite.trip_id}`)
  }

  // Caller will throw redirect via the client form.
  return {
    ok: true,
    redirectTo: invite.trip_id ? `/app/h/trips/${invite.trip_id}` : '/app/h',
  }
}

// Wrapper that throws a Next redirect on success. Server actions called
// from a <form action={...}> can't return a value AND redirect cleanly,
// so we keep the data variant above for the client-side ConfirmAndJoin
// component and add a redirecting variant for purely server-side use.
export async function acceptInviteAsExistingUserActionRedirect(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get('token') ?? '').trim()
  const result = await acceptInviteAsExistingUserAction(token)
  if ('error' in result) {
    redirect(`/accept-invite?token=${encodeURIComponent(token)}&accept_error=${encodeURIComponent(result.error)}`)
  }
  redirect(result.redirectTo)
}
