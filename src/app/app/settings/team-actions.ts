'use server'

// v28.1.0c — Outfitter admin team server actions.
//
// All actions wrapped in try/catch so any thrown error returns a
// friendly {error: string} string instead of bubbling up as an
// error page. UI surfaces these inline.

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireUser } from '../_lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBitebookEmail, buildOutfitterAdminInviteEmail } from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Allowlist mirrors the upgrade-wizard test bypass. Lets Flavio see
// the raw invite URL on pending rows so he can test acceptance flow
// without depending on email delivery.
const TEST_BYPASS_BUILTIN: ReadonlyArray<string> = ['flaviod022@gmail.com']
function isTestBypassAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  if (TEST_BYPASS_BUILTIN.includes(e)) return true
  const envList = (process.env.OUTFITTER_TEST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return envList.includes(e)
}

function newInviteToken(): string {
  // 32 url-safe bytes → ~43 chars base64url.
  return randomBytes(32).toString('base64url')
}

function getOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://bitebook.lastbite.pro'
}

async function assertOwnerOfCurrentOrg() {
  const { profile, user } = await requireUser()
  if (profile.account_tier !== 'outfitter_owner') {
    throw new Error('Only the outfitter owner can manage admins.')
  }
  if (!profile.current_outfitter_org_id) {
    throw new Error('No active outfitter org on this account.')
  }
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('outfitter_orgs')
    .select('id, name, owner_profile_id')
    .eq('id', profile.current_outfitter_org_id)
    .maybeSingle()
  if (!org || org.owner_profile_id !== profile.id) {
    throw new Error('Not authorized for this org.')
  }
  return { profile, user, org, admin }
}

// ── Invite ──────────────────────────────────────────────────────────

export type InviteAdminResult =
  | { ok: true; invite_id: string }
  | { error: string }

export async function inviteOutfitterAdminAction(
  formData: FormData,
): Promise<InviteAdminResult> {
  try {
    const { profile, user, org, admin } = await assertOwnerOfCurrentOrg()

    const raw = (formData.get('email') as string | null) || ''
    const email = raw.trim().toLowerCase()
    if (!email) return { error: 'Email is required.' }
    if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' }
    if (email === user.email?.toLowerCase()) {
      return { error: 'You’re already on this org as the owner.' }
    }

    // Cap check: active members + pending invites must be < 3.
    const [memCnt, inviteCnt] = await Promise.all([
      admin
        .from('outfitter_org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .is('removed_at', null),
      admin
        .from('outfitter_admin_invites')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'pending'),
    ])
    const seatsUsed = (memCnt.count ?? 0) + (inviteCnt.count ?? 0)
    if (seatsUsed >= 3) {
      return {
        error: 'You’ve hit the 3-seat admin cap (owner + 2 admins, including pending invites). Revoke a pending invite or remove an admin to free a seat.',
      }
    }

    // Already an active member by email? Walk auth.users for each
    // active member id and compare email. Small N (max 3) so this
    // never balloons.
    const { data: activeMembers } = await admin
      .from('outfitter_org_members')
      .select('profile_id')
      .eq('org_id', org.id)
      .is('removed_at', null)
    for (const m of activeMembers ?? []) {
      try {
        const { data: au } = await admin.auth.admin.getUserById(m.profile_id)
        if (au?.user?.email?.toLowerCase() === email) {
          return { error: 'That user is already an active member of this org.' }
        }
      } catch {/* ignore single-row lookup failures */}
    }

    // Existing pending invite for this email?
    const { data: existingInvite } = await admin
      .from('outfitter_admin_invites')
      .select('id')
      .eq('org_id', org.id)
      .eq('status', 'pending')
      .ilike('invited_email', email)
      .maybeSingle()
    if (existingInvite?.id) {
      return { error: 'A pending invite already exists for that email. Use Resend or Revoke instead.' }
    }

    const token = newInviteToken()
    const { data: inserted, error: insErr } = await admin
      .from('outfitter_admin_invites')
      .insert({
        org_id: org.id,
        invited_email: email,
        invited_by_profile_id: profile.id,
        token,
      })
      .select('id, token')
      .single()
    if (insErr || !inserted) {
      console.error('[invite-admin] insert failed', insErr?.message)
      return { error: insErr?.message || 'Could not create invite.' }
    }

    // Send the email. Skip-on-no-API-key is built into sendBitebookEmail.
    const ownerName = profile.display_name || user.email || 'Your outfitter owner'
    const acceptUrl = `${getOrigin()}/accept-admin-invite?token=${encodeURIComponent(token)}`
    const built = buildOutfitterAdminInviteEmail({
      ownerName,
      orgName: org.name,
      acceptUrl,
      origin: getOrigin(),
    })
    const sent = await sendBitebookEmail({
      to: email,
      subject: built.subject,
      text: built.text,
      html: built.html,
    })
    if (!sent.sent) {
      // Don't block on email failure — the invite row exists; owner
      // can resend or copy the link via test bypass. Log for ops.
      console.warn('[invite-admin] email send failed', { reason: sent.reason, error: sent.error })
    }

    revalidatePath('/app/settings')
    return { ok: true, invite_id: inserted.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Resend / Revoke ─────────────────────────────────────────────────

export type ResendInviteResult = { ok: true } | { error: string }

export async function resendOutfitterAdminInviteAction(
  inviteId: string,
): Promise<ResendInviteResult> {
  try {
    const { profile, user, org, admin } = await assertOwnerOfCurrentOrg()
    const { data: invite } = await admin
      .from('outfitter_admin_invites')
      .select('id, org_id, invited_email, token, status, expires_at')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}.` }

    // If expired, mint a fresh token + new 14-day window.
    const now = new Date()
    const expired = new Date(invite.expires_at).getTime() < now.getTime()
    let token = invite.token
    if (expired) {
      token = newInviteToken()
      const newExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const { error: upErr } = await admin
        .from('outfitter_admin_invites')
        .update({ token, expires_at: newExpiry, last_sent_at: now.toISOString() })
        .eq('id', inviteId)
      if (upErr) return { error: upErr.message }
    } else {
      await admin
        .from('outfitter_admin_invites')
        .update({ last_sent_at: now.toISOString() })
        .eq('id', inviteId)
    }

    const ownerName = profile.display_name || user.email || 'Your outfitter owner'
    const acceptUrl = `${getOrigin()}/accept-admin-invite?token=${encodeURIComponent(token)}`
    const built = buildOutfitterAdminInviteEmail({
      ownerName,
      orgName: org.name,
      acceptUrl,
      origin: getOrigin(),
    })
    const sent = await sendBitebookEmail({
      to: invite.invited_email,
      subject: built.subject,
      text: built.text,
      html: built.html,
    })
    if (!sent.sent) {
      console.warn('[resend-admin-invite] email send failed', { reason: sent.reason, error: sent.error })
    }

    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function revokeOutfitterAdminInviteAction(
  inviteId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { org, admin } = await assertOwnerOfCurrentOrg()
    const { data: invite } = await admin
      .from('outfitter_admin_invites')
      .select('id, org_id, status')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}; nothing to revoke.` }
    const { error } = await admin
      .from('outfitter_admin_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
    if (error) return { error: error.message }
    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Test-bypass: surface the raw URL ────────────────────────────────

export async function getOutfitterAdminInviteUrlAction(
  inviteId: string,
): Promise<{ ok: true; url: string } | { error: string }> {
  try {
    const { user, org, admin } = await assertOwnerOfCurrentOrg()
    if (!isTestBypassAllowed(user.email)) {
      return { error: 'Not authorized for test bypass.' }
    }
    const { data: invite } = await admin
      .from('outfitter_admin_invites')
      .select('id, org_id, token, status')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}.` }
    return { ok: true, url: `${getOrigin()}/accept-admin-invite?token=${encodeURIComponent(invite.token)}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Accept ──────────────────────────────────────────────────────────

export type AcceptAdminInviteResult =
  | { ok: true; org_id: string }
  | { error: string }

export async function acceptOutfitterAdminInviteAction(
  token: string,
): Promise<AcceptAdminInviteResult> {
  try {
    if (!token) return { error: 'Missing invite token.' }
    const { user, profile } = await requireUser()
    const admin = createAdminClient()

    const { data: invite } = await admin
      .from('outfitter_admin_invites')
      .select('id, org_id, invited_email, invited_by_profile_id, status, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!invite) return { error: 'This invite is invalid or has been revoked.' }
    if (invite.status === 'revoked') return { error: 'This invite has been revoked.' }
    if (invite.status === 'accepted') return { error: 'This invite has already been accepted.' }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      // Mark expired for tidiness.
      await admin.from('outfitter_admin_invites').update({ status: 'expired' }).eq('id', invite.id)
      return { error: 'This invite has expired. Ask the org owner to send a new one.' }
    }

    // Optional sanity: warn if the signed-in email doesn't match the
    // invited email. Don't block — the owner may have sent to a personal
    // address but the user signed in via SSO with a different email.
    // We log + accept anyway since the token is the source of truth.
    if (user.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
      console.warn('[accept-admin-invite] signed-in email differs from invited', {
        signedIn: user.email,
        invited: invite.invited_email,
      })
    }

    // Insert member row. The _enforce_outfitter_max_members trigger
    // throws if the org is full — translate that to a friendly error.
    const { error: memErr } = await admin
      .from('outfitter_org_members')
      .insert({
        org_id: invite.org_id,
        profile_id: profile.id,
        role: 'admin',
        invited_by: invite.invited_by_profile_id,
        joined_at: new Date().toISOString(),
      })
    if (memErr) {
      // Look for the cap-trigger message.
      if (/3 active members/i.test(memErr.message)) {
        // Surface a friendlier error + include the owner's email.
        const { data: owner } = await admin
          .from('outfitter_orgs')
          .select('owner_profile_id')
          .eq('id', invite.org_id)
          .maybeSingle()
        let ownerEmail: string | null = null
        if (owner?.owner_profile_id) {
          try {
            const r = await admin.auth.admin.getUserById(owner.owner_profile_id)
            ownerEmail = r.data?.user?.email ?? null
          } catch {/* ignore */}
        }
        return {
          error: ownerEmail
            ? `This outfitter has reached their admin seat limit. Contact ${ownerEmail} to free up a seat.`
            : 'This outfitter has reached their admin seat limit. Contact the owner to free up a seat.',
        }
      }
      return { error: memErr.message }
    }

    // Mark invite accepted.
    await admin
      .from('outfitter_admin_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_profile_id: profile.id,
      })
      .eq('id', invite.id)

    // Flip the accepting user's tier + current org.
    await admin
      .from('profiles')
      .update({
        account_tier: 'outfitter_admin',
        current_outfitter_org_id: invite.org_id,
      })
      .eq('id', profile.id)

    revalidatePath('/app')
    return { ok: true, org_id: invite.org_id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Remove admin ────────────────────────────────────────────────────

export async function removeOutfitterAdminAction(
  memberId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { profile, org, admin } = await assertOwnerOfCurrentOrg()

    const { data: member } = await admin
      .from('outfitter_org_members')
      .select('id, org_id, profile_id, role, removed_at')
      .eq('id', memberId)
      .maybeSingle()
    if (!member || member.org_id !== org.id) return { error: 'Member not found.' }
    if (member.removed_at) return { error: 'Member is already removed.' }
    if (member.profile_id === profile.id || member.role === 'owner') {
      return { error: 'The owner can’t be removed via this flow.' }
    }

    // Soft-remove member.
    const { error: rmErr } = await admin
      .from('outfitter_org_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', memberId)
    if (rmErr) return { error: rmErr.message }

    // Revert tier on the removed user. Check whether they have an
    // active guide sub — if yes, back to 'guide'; otherwise 'hunter'.
    const { data: sub } = await admin
      .from('outfitter_subscriptions')
      .select('status')
      .eq('guide_id', member.profile_id)
      .maybeSingle()
    const hasActiveGuideSub = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status)
    const nextTier = hasActiveGuideSub ? 'guide' : 'hunter'

    await admin
      .from('profiles')
      .update({
        account_tier: nextTier,
        current_outfitter_org_id: null,
      })
      .eq('id', member.profile_id)

    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Read: surface the team + pending invites for the Settings UI ────

export type OutfitterTeamMember = {
  member_id: string
  profile_id: string
  display_name: string
  email: string | null
  role: string
  joined_at: string | null
}
export type OutfitterPendingInvite = {
  invite_id: string
  invited_email: string
  created_at: string
  expires_at: string
  last_sent_at: string
}
export type OutfitterTeamSnapshot = {
  members: OutfitterTeamMember[]
  pending: OutfitterPendingInvite[]
  seats_used: number
  seats_total: number
  is_owner: boolean
  test_bypass: boolean
}

export async function fetchOutfitterTeamSnapshot(): Promise<OutfitterTeamSnapshot | null> {
  const { profile, user } = await requireUser()
  if (
    profile.account_tier !== 'outfitter_owner' &&
    profile.account_tier !== 'outfitter_admin'
  ) {
    return null
  }
  if (!profile.current_outfitter_org_id) return null
  const orgId = profile.current_outfitter_org_id
  const admin = createAdminClient()

  const [memberRes, pendingRes] = await Promise.all([
    admin
      .from('outfitter_org_members')
      .select('id, profile_id, role, joined_at')
      .eq('org_id', orgId)
      .is('removed_at', null)
      .order('joined_at', { ascending: true }),
    admin
      .from('outfitter_admin_invites')
      .select('id, invited_email, created_at, expires_at, last_sent_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ])

  const members: OutfitterTeamMember[] = []
  for (const m of memberRes.data ?? []) {
    let email: string | null = null
    let displayName = ''
    const { data: pr } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', m.profile_id)
      .maybeSingle()
    displayName = pr?.display_name || 'Member'
    try {
      const r = await admin.auth.admin.getUserById(m.profile_id)
      email = r.data?.user?.email ?? null
    } catch {/* ignore */}
    members.push({
      member_id: m.id,
      profile_id: m.profile_id,
      display_name: displayName,
      email,
      role: m.role,
      joined_at: m.joined_at,
    })
  }

  const pending: OutfitterPendingInvite[] = (pendingRes.data ?? []).map((r) => ({
    invite_id: r.id,
    invited_email: r.invited_email,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_sent_at: r.last_sent_at,
  }))

  return {
    members,
    pending,
    seats_used: members.length + pending.length,
    seats_total: 3,
    is_owner: profile.account_tier === 'outfitter_owner',
    test_bypass: isTestBypassAllowed(user.email),
  }
}
