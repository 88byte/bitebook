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

export type GuideTier = 'full' | 'read_only' | 'locked'

export type SubscriptionState = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  current_period_end: string | null
  trial_end: string | null
}

export type TierResult = {
  tier: GuideTier
  /** Reason short-code surfaced in error messages. */
  reason: 'no_row' | 'incomplete' | 'past_due' | 'canceled' | 'ok'
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

export const getGuideTier = cache(async (userId: string): Promise<TierResult> => {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('status, current_period_end, trial_end')
    .eq('guide_id', userId)
    .maybeSingle<SubscriptionState>()

  if (!row) {
    // Defensive: a guide row should exist post-checkout. If one
    // doesn't, treat as locked so they can't write before billing
    // is reconciled. The settings panel surfaces a contact-support
    // message in this state.
    return { tier: 'locked', reason: 'no_row', subscription: null }
  }
  const { tier, reason } = tierFromStatus(row.status)
  return { tier, reason, subscription: row }
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
  // Hunters and admins don't have outfitter_subscriptions rows. Skip
  // the lookup so we don't 'locked' them via reason='no_row'.
  if (role === 'hunter' || role === 'admin') return { ok: true }
  const t = await getGuideTier(userId)
  if (t.tier === 'full') return { ok: true }
  return {
    error: tierMessage(t.reason),
    tier: t.tier,
  }
}
