// v28.1.0e.2 Sprint 3.3 hotfix — internal helper, NOT a server action.
//
// Validates a guide-network invite token + user id and (if valid) inserts
// the outfitter_guide_network row and marks the invite accepted. Used in
// two places:
//
//   1. acceptOutfitterGuideInviteAction (after the personal-sub check).
//   2. The Stripe webhook on `customer.subscription.created` /
//      `checkout.session.completed`, when the session metadata carries
//      a guide_network_invite_token, so a new paying guide who signed
//      up via /signup?network_invite_token=X is auto-joined to the
//      network the moment their trial subscription is live.
//
// Idempotent: re-running with the same (user_id, token) when the user
// is already an active member returns ok without inserting a duplicate.

import { createAdminClient } from '@/lib/supabase/admin'

export type NetworkAcceptResult =
  | { ok: true; org_id: string }
  | { ok: false; error: string }

export async function acceptGuideNetworkInviteByToken(
  userId: string,
  token: string,
): Promise<NetworkAcceptResult> {
  if (!userId) return { ok: false, error: 'Missing user.' }
  if (!token) return { ok: false, error: 'Missing token.' }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('outfitter_guide_network_invites')
    .select('id, org_id, invited_email, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!invite) return { ok: false, error: 'Invite not found.' }
  if (invite.status === 'revoked') return { ok: false, error: 'Invite revoked.' }
  if (invite.status === 'accepted') {
    // Already accepted — usually fine if this user IS the accepted_by.
    // The downstream membership upsert handles the active-row case.
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin
      .from('outfitter_guide_network_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id)
    return { ok: false, error: 'Invite expired.' }
  }

  // Existing membership? Re-activate if removed.
  const { data: existing } = await admin
    .from('outfitter_guide_network')
    .select('id, status')
    .eq('org_id', invite.org_id)
    .eq('guide_profile_id', userId)
    .maybeSingle()

  if (existing) {
    if (existing.status !== 'active') {
      const { error: upErr } = await admin
        .from('outfitter_guide_network')
        .update({
          status: 'active',
          accepted_at: new Date().toISOString(),
          removed_at: null,
        })
        .eq('id', existing.id)
      if (upErr) return { ok: false, error: upErr.message }
    }
  } else {
    const { error: insErr } = await admin
      .from('outfitter_guide_network')
      .insert({
        org_id: invite.org_id,
        guide_profile_id: userId,
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
    if (insErr) return { ok: false, error: insErr.message }
  }

  // Make sure the user is flagged as a guide so the guide shell renders.
  await admin.from('profiles').update({ role: 'guide' }).eq('id', userId)

  if (invite.status !== 'accepted') {
    await admin
      .from('outfitter_guide_network_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_profile_id: userId,
      })
      .eq('id', invite.id)
  }

  return { ok: true, org_id: invite.org_id }
}
