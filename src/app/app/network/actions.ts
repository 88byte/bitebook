'use server'

// v28.1.0e.0 Sprint 3.3 — Outfitter guide-network server actions.
//
// Mirrors team-actions.ts in shape but with these intentional
// differences:
//   • Both owner AND admin can invite (admins manage the network too).
//   • No seat cap. The 3-seat trigger applies to outfitter_org_members
//     only; network guides live in outfitter_guide_network and are
//     unbounded.
//   • Accept inserts an outfitter_guide_network row (NOT an
//     outfitter_org_members row). Network guides are not admins of
//     the org; they keep their own guide identity.
//   • Accept does NOT flip account_tier or current_outfitter_org_id.
//     A network guide is still primarily a 'guide' tier account; the
//     network row gives them write access through the org under
//     billing-tier resolution (see billing-tier.ts).
//
// All actions wrapped in try/catch and return discriminated
// {ok:true,...} | {error:string} so the UI can render inline errors.

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireUser } from '../_lib/auth'
import { hasActiveGuideSubscription } from '../_lib/billing-tier'
import { acceptGuideNetworkInviteByToken } from '../_lib/network-accept'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendBitebookEmail,
  buildOutfitterGuideNetworkInviteEmail,
} from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Same allowlist as team-actions for surfacing the raw invite URL
// so Flavio can test acceptance without depending on email delivery.
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
  return randomBytes(32).toString('base64url')
}

function getOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://bitebook.lastbite.pro'
}

// Owner OR admin of the user's current org. Both can manage the
// guide network. Throws on miss so callers can let try/catch surface
// the friendly error.
async function assertOrgManagerOfCurrentOrg() {
  const { profile, user } = await requireUser()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' ||
      profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  if (!isOutfitterMember) {
    throw new Error('Only the outfitter owner or admins can manage the guide network.')
  }
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('outfitter_orgs')
    .select('id, name, owner_profile_id')
    .eq('id', profile.current_outfitter_org_id as string)
    .maybeSingle()
  if (!org) throw new Error('Outfitter org not found.')

  // Defense-in-depth: confirm the caller actually has an active
  // outfitter_org_members row. account_tier alone could be stale.
  const { data: mem } = await admin
    .from('outfitter_org_members')
    .select('id, role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .is('removed_at', null)
    .maybeSingle()
  if (!mem || (mem.role !== 'owner' && mem.role !== 'admin')) {
    throw new Error('Not authorized for this org.')
  }
  return { profile, user, org, admin }
}

// ── Invite ──────────────────────────────────────────────────────────

export type InviteGuideResult =
  | { ok: true; invite_id: string }
  | { error: string }

export async function inviteOutfitterGuideAction(
  formData: FormData,
): Promise<InviteGuideResult> {
  try {
    const { profile, user, org, admin } = await assertOrgManagerOfCurrentOrg()

    const raw = (formData.get('email') as string | null) || ''
    const email = raw.trim().toLowerCase()
    if (!email) return { error: 'Email is required.' }
    if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' }
    if (email === user.email?.toLowerCase()) {
      return { error: "You can't invite yourself." }
    }

    // Already an active member of the guide network by email? Walk
    // active rows and look up email through auth.users. Pool is small
    // for now; we can index later if needed.
    const { data: activeGuides } = await admin
      .from('outfitter_guide_network')
      .select('guide_profile_id')
      .eq('org_id', org.id)
      .eq('status', 'active')
    for (const g of activeGuides ?? []) {
      try {
        const { data: au } = await admin.auth.admin.getUserById(g.guide_profile_id)
        if (au?.user?.email?.toLowerCase() === email) {
          return { error: 'That guide is already in your network.' }
        }
      } catch {/* ignore single-row lookup failures */}
    }

    // Existing pending invite for this email on this org?
    const { data: existingInvite } = await admin
      .from('outfitter_guide_network_invites')
      .select('id')
      .eq('org_id', org.id)
      .eq('status', 'pending')
      .ilike('invited_email', email)
      .maybeSingle()
    if (existingInvite?.id) {
      return {
        error: 'A pending invite already exists for that email. Use Resend or Revoke instead.',
      }
    }

    const token = newInviteToken()
    const { data: inserted, error: insErr } = await admin
      .from('outfitter_guide_network_invites')
      .insert({
        org_id: org.id,
        invited_email: email,
        invited_by_profile_id: profile.id,
        token,
      })
      .select('id, token')
      .single()
    if (insErr || !inserted) {
      console.error('[invite-guide] insert failed', insErr?.message)
      return { error: insErr?.message || 'Could not create invite.' }
    }

    const inviterName = profile.display_name || user.email || 'Your outfitter'
    const acceptUrl = `${getOrigin()}/accept-guide-network-invite?token=${encodeURIComponent(token)}`
    const built = buildOutfitterGuideNetworkInviteEmail({
      inviterName,
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
      console.warn('[invite-guide] email send failed', { reason: sent.reason, error: sent.error })
    }

    revalidatePath('/app/network')
    return { ok: true, invite_id: inserted.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Resend / Revoke ─────────────────────────────────────────────────

export type ResendInviteResult = { ok: true } | { error: string }

export async function resendOutfitterGuideInviteAction(
  inviteId: string,
): Promise<ResendInviteResult> {
  try {
    const { profile, user, org, admin } = await assertOrgManagerOfCurrentOrg()
    const { data: invite } = await admin
      .from('outfitter_guide_network_invites')
      .select('id, org_id, invited_email, token, status, expires_at')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}.` }

    const now = new Date()
    const expired = new Date(invite.expires_at).getTime() < now.getTime()
    let token = invite.token
    if (expired) {
      token = newInviteToken()
      const newExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const { error: upErr } = await admin
        .from('outfitter_guide_network_invites')
        .update({ token, expires_at: newExpiry, last_sent_at: now.toISOString() })
        .eq('id', inviteId)
      if (upErr) return { error: upErr.message }
    } else {
      await admin
        .from('outfitter_guide_network_invites')
        .update({ last_sent_at: now.toISOString() })
        .eq('id', inviteId)
    }

    const inviterName = profile.display_name || user.email || 'Your outfitter'
    const acceptUrl = `${getOrigin()}/accept-guide-network-invite?token=${encodeURIComponent(token)}`
    const built = buildOutfitterGuideNetworkInviteEmail({
      inviterName,
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
      console.warn('[resend-guide-invite] email send failed', { reason: sent.reason, error: sent.error })
    }

    revalidatePath('/app/network')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function revokeOutfitterGuideInviteAction(
  inviteId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { org, admin } = await assertOrgManagerOfCurrentOrg()
    const { data: invite } = await admin
      .from('outfitter_guide_network_invites')
      .select('id, org_id, status')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}; nothing to revoke.` }
    const { error } = await admin
      .from('outfitter_guide_network_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId)
    if (error) return { error: error.message }
    revalidatePath('/app/network')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Test-bypass: surface the raw URL ────────────────────────────────

export async function getOutfitterGuideInviteUrlAction(
  inviteId: string,
): Promise<{ ok: true; url: string } | { error: string }> {
  try {
    const { user, org, admin } = await assertOrgManagerOfCurrentOrg()
    if (!isTestBypassAllowed(user.email)) {
      return { error: 'Not authorized for test bypass.' }
    }
    const { data: invite } = await admin
      .from('outfitter_guide_network_invites')
      .select('id, org_id, token, status')
      .eq('id', inviteId)
      .maybeSingle()
    if (!invite || invite.org_id !== org.id) return { error: 'Invite not found.' }
    if (invite.status !== 'pending') return { error: `Invite is ${invite.status}.` }
    return {
      ok: true,
      url: `${getOrigin()}/accept-guide-network-invite?token=${encodeURIComponent(invite.token)}`,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Accept (signed-in path) ─────────────────────────────────────────

export type AcceptGuideInviteResult =
  | { ok: true; org_id: string }
  | { error: string; code?: 'subscription_required' }

export async function acceptOutfitterGuideInviteAction(
  token: string,
): Promise<AcceptGuideInviteResult> {
  try {
    if (!token) return { error: 'Missing invite token.' }
    const { profile } = await requireUser()

    // v28.1.0e.2 — every guide pays $9/mo. Network membership does NOT
    // come with a free seat. Block accept if the caller has no active
    // personal guide subscription. UI branches on `code` to route them
    // to checkout / billing settings.
    const subOk = await hasActiveGuideSubscription(profile.id)
    if (!subOk) {
      return {
        error: 'A Bite Book Guide subscription ($9/mo, 7-day free trial) is required to join an outfitter network.',
        code: 'subscription_required',
      }
    }

    const res = await acceptGuideNetworkInviteByToken(profile.id, token)
    if (!res.ok) return { error: res.error }
    revalidatePath('/app')
    return { ok: true, org_id: res.org_id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// v28.1.0e.2 — Removed signupAndAcceptOutfitterGuideInviteAction.
// That action used to create a free guide account on accept, which
// contradicted the pricing model (every guide pays $9/mo). New signups
// flow through /signup with the invite token preserved on the auth
// user's user_metadata, and the Stripe webhook (or a post-checkout
// redirect) accepts the invite after the subscription is established.
//
// Anything still importing the old action will fail at TypeScript so
// we know to update the call site rather than leaving a silent free
// path.

// ── Remove guide from network ───────────────────────────────────────

export async function removeOutfitterGuideAction(
  networkId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { org, admin } = await assertOrgManagerOfCurrentOrg()
    const { data: row } = await admin
      .from('outfitter_guide_network')
      .select('id, org_id, status')
      .eq('id', networkId)
      .maybeSingle()
    if (!row || row.org_id !== org.id) return { error: 'Guide not found in this network.' }
    if (row.status === 'removed') return { error: 'That guide is already removed.' }
    const { error } = await admin
      .from('outfitter_guide_network')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('id', networkId)
    if (error) return { error: error.message }
    revalidatePath('/app/network')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Read: snapshot for the /app/network UI ──────────────────────────

export type NetworkGuide = {
  network_id: string
  guide_profile_id: string
  display_name: string
  email: string | null
  accepted_at: string | null
}
export type NetworkPendingInvite = {
  invite_id: string
  invited_email: string
  created_at: string
  expires_at: string
  last_sent_at: string
}
export type NetworkSnapshot = {
  guides: NetworkGuide[]
  pending: NetworkPendingInvite[]
  org_name: string
  is_manager: boolean
  test_bypass: boolean
}

export async function fetchOutfitterNetworkSnapshot(): Promise<NetworkSnapshot | null> {
  const { profile, user } = await requireUser()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' ||
      profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  if (!isOutfitterMember) return null
  const orgId = profile.current_outfitter_org_id as string
  const admin = createAdminClient()

  const [orgRes, guidesRes, pendingRes] = await Promise.all([
    admin
      .from('outfitter_orgs')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle(),
    admin
      .from('outfitter_guide_network')
      .select('id, guide_profile_id, accepted_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('accepted_at', { ascending: true }),
    admin
      .from('outfitter_guide_network_invites')
      .select('id, invited_email, created_at, expires_at, last_sent_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ])
  if (!orgRes.data) return null

  const guides: NetworkGuide[] = []
  for (const g of guidesRes.data ?? []) {
    let email: string | null = null
    let displayName = ''
    const { data: pr } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', g.guide_profile_id)
      .maybeSingle()
    displayName = pr?.display_name || 'Guide'
    try {
      const r = await admin.auth.admin.getUserById(g.guide_profile_id)
      email = r.data?.user?.email ?? null
    } catch {/* ignore */}
    guides.push({
      network_id: g.id,
      guide_profile_id: g.guide_profile_id,
      display_name: displayName,
      email,
      accepted_at: g.accepted_at,
    })
  }
  const pending: NetworkPendingInvite[] = (pendingRes.data ?? []).map((r) => ({
    invite_id: r.id,
    invited_email: r.invited_email,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_sent_at: r.last_sent_at,
  }))

  return {
    guides,
    pending,
    org_name: orgRes.data.name,
    is_manager: true,
    test_bypass: isTestBypassAllowed(user.email),
  }
}
