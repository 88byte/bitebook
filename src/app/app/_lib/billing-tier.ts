// v27.4.3 — single source of truth for subscription gating.
//
// Every mutating server action calls assertWriteAllowed() at the top.
// Every /app/* page can call getGuideTier(userId) to render a banner
// or hide creation CTAs. Tier policy is locked to one table here — if
// the rules change, this file is the only edit point.
//
//   tier      | enters when                                     | UI behavior
//   ----------+-------------------------------------------------+---------------------
//   full      | trialing OR active (incl. cancel_at_period_end) | normal app
//   read_only | past_due OR canceled                            | banner + block writes
//   locked    | incomplete OR no row                            | redirect to billing
//
// The cancel_at_period_end=true case stays in tier=full because the
// guide has already paid for the period. Stripe flips status=canceled
// at period_end via the subscription.deleted webhook; once that fires
// we drop into read_only automatically.
//
// React cache() dedupes the DB read per-request — multiple call sites
// (action gate, page banner, page CTA visibility) don't multiply
// queries. Reset on each request.

import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from './auth'

export type GuideTier = 'full' | 'read_only' | 'locked'

export type SubscriptionState = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  current_period_end: string | null
  trial_end: string | null
  comp_until?: string | null
}

export type TierResult = {
  tier: GuideTier
  /** Reason short-code surfaced in error messages. */
  reason: 'no_row' | 'incomplete' | 'past_due' | 'canceled' | 'ok' | 'comp' | 'admin'
  /** Subscription row used to compute the tier (null when no row). */
  subscription: SubscriptionState | null
}

function tierFromStatus(status: SubscriptionState['status']): { tier: GuideTier; reason: TierResult['reason'] } {
  switch (status) {
    case 'trialing':
    case 'active':
      // cancel_at_period_end=true also lands here — Stripe still
      // reports status='active' (or 'trialing') until the period
      // actually ends. The guide paid for this period; full access
      // is the right behavior.
      return { tier: 'full', reason: 'ok' }
    case 'past_due':
      return { tier: 'read_only', reason: 'past_due' }
    case 'canceled':
      return { tier: 'read_only', reason: 'canceled' }
    case 'incomplete':
    default:
      return { tier: 'locked', reason: 'incomplete' }
  }
}

// v28.1.0e.2 Sprint 3.3 hotfix — outfitter coverage is OWNER+ADMIN only.
//
// Earlier v28.1.0e.0 promoted network guides to "covered" by the org's
// $39/mo subscription. That contradicted the pricing model: the
// outfitter sub covers admin tooling + the org itself + admin seats +
// network management. It does NOT cover individual guide seats. Every
// guide pays $9/mo for their own subscription, network member or not.
//
// This resolver now only returns coverage for outfitter_org_members
// with role 'owner' or 'admin'. Network guides (rows in
// outfitter_guide_network) get NO coverage here; they must have their
// own active personal sub or be tier-gated like any other guide.
async function resolveOutfitterCoverage(userId: string): Promise<TierResult | null> {
  const admin = createAdminClient()

  const { data: ownAdminRows } = await admin
    .from('outfitter_org_members')
    .select('org_id, role')
    .eq('profile_id', userId)
    .is('removed_at', null)
    .in('role', ['owner', 'admin'])

  const orgIds = Array.from(
    new Set<string>((ownAdminRows ?? []).map((r) => r.org_id as string)),
  )
  if (orgIds.length === 0) return null

  // For each org, resolve the org's billing subscription (keyed on
  // owner_profile_id). If ANY org has a full-tier sub, the caller is
  // covered. Otherwise we surface a representative tier from the
  // first org so callers can show a sensible banner.
  let representative: TierResult | null = null
  for (const orgId of orgIds) {
    const { data: org } = await admin
      .from('outfitter_orgs')
      .select('owner_profile_id')
      .eq('id', orgId)
      .maybeSingle()
    if (!org?.owner_profile_id) continue
    const { data: orgSub } = await admin
      .from('outfitter_subscriptions')
      .select('status, current_period_end, trial_end, comp_until')
      .eq('guide_id', org.owner_profile_id)
      .maybeSingle<SubscriptionState>()
    if (!orgSub) {
      representative ??= { tier: 'locked', reason: 'no_row', subscription: null }
      continue
    }
    if (orgSub.comp_until) {
      const today = new Date().toISOString().slice(0, 10)
      if (orgSub.comp_until >= today) {
        return { tier: 'full', reason: 'comp', subscription: orgSub }
      }
    }
    const { tier, reason } = tierFromStatus(orgSub.status)
    if (tier === 'full') return { tier: 'full', reason, subscription: orgSub }
    representative ??= { tier, reason, subscription: orgSub }
  }
  return representative
}

// v28.1.0e.2 — exported gate for the network accept flow. Returns true
// when the caller has an active personal guide subscription (trialing,
// active, comp). Network guides must pass this to join a network; the
// org sub does NOT count.
export async function hasActiveGuideSubscription(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: subRow } = await admin
    .from('outfitter_subscriptions')
    .select('status, comp_until')
    .eq('guide_id', userId)
    .maybeSingle<{ status: string; comp_until: string | null }>()
  if (!subRow) return false
  if (subRow.comp_until) {
    const today = new Date().toISOString().slice(0, 10)
    if (subRow.comp_until >= today) return true
  }
  return subRow.status === 'trialing' || subRow.status === 'active'
}

export const getGuideTier = cache(async (userId: string): Promise<TierResult> => {
  const admin = createAdminClient()

  // v27.6.2 — Admins always tier=full, regardless of subscription
  // status. Bypass at the top of the function so the trial banner /
  // read-only banner / locked interstitial never trip on Flavio's
  // own account. The outfitter_subscriptions row stays as-is — we're
  // not fighting Stripe state, just refusing to gate admins on it.
  // Email match via ADMIN_EMAILS (v27.6.0.2) is the canonical check.
  // We still pull the subscription row so callers that introspect
  // subscription.* (settings billing panel) keep working.
  const { data: subRow } = await admin
    .from('outfitter_subscriptions')
    .select('status, current_period_end, trial_end, comp_until')
    .eq('guide_id', userId)
    .maybeSingle<SubscriptionState>()

  let adminEmail = false
  try {
    const { data: userRes } = await admin.auth.admin.getUserById(userId)
    adminEmail = isAdminEmail(userRes?.user?.email ?? null)
  } catch (e) {
    console.warn('[billing-tier:admin-lookup]', (e as Error).message)
  }
  if (adminEmail) {
    return { tier: 'full', reason: 'admin', subscription: subRow ?? null }
  }

  // v28.1.0e.0 — Outfitter coverage. Owners + admins always look here
  // (their personal subRow does not exist). Network guides look here
  // when their personal sub is missing OR locked, so they can write
  // under the outfitter's bill.
  if (!subRow) {
    const covered = await resolveOutfitterCoverage(userId)
    if (covered) return covered
    // Defensive: a guide row should exist post-checkout. If one
    // doesn't AND there's no outfitter coverage, treat as locked so
    // they can't write before billing is reconciled.
    return { tier: 'locked', reason: 'no_row', subscription: null }
  }

  // v27.6.0 — Comp accounts. comp_until = a date in the future means
  // the admin has marked this guide free-until-X. Treat as full tier
  // regardless of Stripe status; the comp window is the source of
  // truth. Once comp_until <= today, fall through to the normal
  // status-based tier resolution. Date comparison is YYYY-MM-DD vs
  // today's YYYY-MM-DD so timezone drift can't accidentally expire a
  // comp at midnight UTC.
  if (subRow.comp_until) {
    const today = new Date().toISOString().slice(0, 10)
    if (subRow.comp_until >= today) {
      return { tier: 'full', reason: 'comp', subscription: subRow }
    }
  }

  const { tier, reason } = tierFromStatus(subRow.status)
  if (tier === 'full') return { tier, reason, subscription: subRow }
  // Personal sub is not full. If they're an outfitter owner/admin or
  // active network guide, let the org's coverage promote them.
  const covered = await resolveOutfitterCoverage(userId)
  if (covered && covered.tier === 'full') return covered
  return { tier, reason, subscription: subRow }
})

// Human-readable copy keyed by reason. Centralized so banners +
// action errors stay consistent.
export function tierMessage(reason: TierResult['reason']): string {
  switch (reason) {
    case 'past_due':
      return 'Payment failed. Update your card on /app/settings?tab=billing to keep using Bite Book.'
    case 'canceled':
      return 'Your subscription ended. Restart subscription on /app/settings?tab=billing to resume.'
    case 'incomplete':
      return "Your subscription isn't set up yet. Finish signup to start using Bite Book."
    case 'no_row':
      return "We can't find your billing account. Email support@lastbite.pro and we'll fix it."
    case 'ok':
    default:
      return ''
  }
}

// Action-level write gate. Call at the top of every mutating server
// action AFTER requireGuide()/requireUser() (so we know auth.uid()
// exists). Returns either ok=true or a structured error the action
// can return.
//
// Hunters and admins are not subscription-gated — only guides have
// outfitter_subscriptions rows. Wallet actions and other shared
// mutators pass profile.role so the gate becomes a no-op for those
// users. Guide-only actions can omit the role param.
//
// Action callers pattern:
//   const { profile } = await requireUser()
//   const gate = await assertWriteAllowed(profile.id, profile.role)
//   if ('error' in gate) return { error: gate.error }
//   // ... rest of action
export type WriteGateResult = { ok: true } | { error: string; tier: GuideTier }

export async function assertWriteAllowed(
  userId: string,
  role?: string | null,
): Promise<WriteGateResult> {
  // Hunters skip the gate — they don't have outfitter_subscriptions
  // rows. v27.6.0.2 — the role==='admin' bypass below is dead-code
  // today (admins are guides with role='guide' + email match), but
  // we keep it for forward compatibility if profile.role gains 'admin'
  // assignments again in the future. Admins-as-guides are caught by
  // getGuideTier()'s email-based bypass (v27.6.2).
  if (role === 'hunter' || role === 'admin') return { ok: true }
  const t = await getGuideTier(userId)
  if (t.tier === 'full') return { ok: true }
  return {
    error: tierMessage(t.reason),
    tier: t.tier,
  }
}
