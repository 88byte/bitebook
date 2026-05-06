'use server'

// v27.6.0 — Mission Control mutating actions.
//
// Every action in this file:
//   1. requireAdmin() to gate access (404s non-admins).
//   2. Writes an admin_actions audit row BEFORE the underlying
//      mutation fires. If the audit insert fails, abort — we'd rather
//      lose the action than have an unaudited write.
//   3. Performs the underlying mutation through the service-role
//      admin client (bypasses RLS — these are cross-guide writes).
//   4. revalidates the relevant /admin paths so the page re-fetches
//      after the action.
//
// All three actions return { ok: true } | { error: string } so
// the calling client can render error toasts inline.

import { revalidatePath } from 'next/cache'
import { requireAdmin, isAdminEmail } from '../../app/_lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, ensureBitebookGuidePrices } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

type SubStatus = Database['public']['Enums']['subscription_status']
type SubInterval = Database['public']['Enums']['subscription_interval']

export type AdminActionResult = { ok: true } | { error: string }

// Generic audit row writer. Returns null on success or the error
// message on failure. Callers must abort the action if this returns
// non-null — an audited write is the whole point of this layer.
async function writeAuditRow(
  adminId: string,
  actionType: string,
  targetGuideId: string | null,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const admin = createAdminClient()
  // Round-trip through JSON.stringify/parse so the value satisfies
  // Supabase's Json type (which doesn't include Record<string, unknown>
  // directly). Payloads here are always plain serialisable values
  // — strings, nulls, booleans — so this is a no-op at runtime.
  const jsonPayload = JSON.parse(JSON.stringify(payload))
  const { error } = await admin.from('admin_actions').insert({
    admin_id: adminId,
    action_type: actionType,
    target_guide_id: targetGuideId,
    payload: jsonPayload,
  })
  if (error) {
    console.warn('[admin-actions:audit]', error.code, error.message)
    return error.message || 'Audit log write failed'
  }
  return null
}

// 1. Flip subscription status directly in the DB. NO Stripe write —
// this is a test-mode override so the admin can drop a guide into
// past_due / canceled / etc. and verify the v27.4.3 gating banners
// fire correctly. Stripe-side state is untouched.
const VALID_STATUS_VALUES = new Set<SubStatus>([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
])

export async function flipSubscriptionStatusAction(
  guideId: string,
  newStatus: SubStatus,
): Promise<AdminActionResult> {
  const { profile } = await requireAdmin()
  if (!guideId) return { error: 'Missing guide id.' }
  if (!VALID_STATUS_VALUES.has(newStatus)) {
    return { error: `Invalid status: ${newStatus}` }
  }

  const admin = createAdminClient()
  // Pull the existing row so we can record the before-state in the
  // audit payload — useful for "wait, what was the prior state when
  // I flipped this?" forensics later.
  const { data: prior } = await admin
    .from('outfitter_subscriptions')
    .select('status, billing_interval, comp_until')
    .eq('guide_id', guideId)
    .maybeSingle()

  const auditErr = await writeAuditRow(profile.id, 'flip_subscription_status', guideId, {
    new_status: newStatus,
    prior_status: prior?.status ?? null,
    note: 'DB-only override; Stripe untouched',
  })
  if (auditErr) return { error: auditErr }

  const { error } = await admin
    .from('outfitter_subscriptions')
    .update({ status: newStatus })
    .eq('guide_id', guideId)
  if (error) {
    console.warn('[admin-actions.flipStatus:update]', error.code, error.message)
    return { error: error.message || 'Could not update status.' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/guides/${guideId}`)
  return { ok: true }
}

// 2. Comp the account. Sets:
//   - status='active' (so the gating layer treats them as full)
//   - billing_interval=NULL (no real plan)
//   - stripe_subscription_id=NULL (decoupled from Stripe — admin
//     should NOT also have a paid Stripe sub on this account)
//   - comp_until=<provided date>
// We DO NOT touch stripe_customer_id — if the guide ever transitions
// off the comp we still want their Stripe customer to exist so they
// can re-subscribe via the regular flow.
export async function compAccountAction(
  guideId: string,
  compUntil: string,
): Promise<AdminActionResult> {
  const { profile } = await requireAdmin()
  if (!guideId) return { error: 'Missing guide id.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(compUntil)) {
    return { error: 'Invalid comp date — expected YYYY-MM-DD.' }
  }
  // Defensive: don't accept comps that already expired today.
  const today = new Date().toISOString().slice(0, 10)
  if (compUntil < today) {
    return { error: 'Comp date must be today or later.' }
  }

  const admin = createAdminClient()
  const { data: prior } = await admin
    .from('outfitter_subscriptions')
    .select('status, billing_interval, stripe_subscription_id, comp_until')
    .eq('guide_id', guideId)
    .maybeSingle()

  const auditErr = await writeAuditRow(profile.id, 'comp_account', guideId, {
    comp_until: compUntil,
    prior_status: prior?.status ?? null,
    prior_interval: prior?.billing_interval ?? null,
    prior_comp_until: prior?.comp_until ?? null,
    prior_subscription_id: prior?.stripe_subscription_id ?? null,
  })
  if (auditErr) return { error: auditErr }

  // If a paying subscription exists on the row, we don't auto-cancel
  // it on Stripe's side — that's a deliberate two-step the admin can
  // perform separately if they want to fully terminate billing.
  // Comp simply means "from our side, treat this as full".
  const { error } = await admin
    .from('outfitter_subscriptions')
    .upsert({
      guide_id: guideId,
      status: 'active',
      billing_interval: null,
      stripe_subscription_id: null,
      comp_until: compUntil,
    }, { onConflict: 'guide_id' })
  if (error) {
    console.warn('[admin-actions.comp:update]', error.code, error.message)
    return { error: error.message || 'Could not comp account.' }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/revenue')
  revalidatePath(`/admin/guides/${guideId}`)
  return { ok: true }
}

// Clear comp — flip the account back to its real Stripe state. We
// write status from the live Stripe subscription if we can read one;
// otherwise fall back to 'incomplete' (which lands in tier=locked,
// matching the rule that no-row guides can't write).
export async function clearCompAction(
  guideId: string,
): Promise<AdminActionResult> {
  const { profile } = await requireAdmin()
  if (!guideId) return { error: 'Missing guide id.' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_subscription_id, comp_until, billing_interval')
    .eq('guide_id', guideId)
    .maybeSingle()

  const auditErr = await writeAuditRow(profile.id, 'clear_comp', guideId, {
    prior_comp_until: row?.comp_until ?? null,
  })
  if (auditErr) return { error: auditErr }

  // Try to learn the Stripe-side status so the post-clear state is
  // honest. Best-effort — if Stripe is unreachable we still wipe
  // comp_until and let the next webhook reconcile.
  let resolvedStatus: SubStatus = 'incomplete'
  let resolvedInterval: SubInterval | null = row?.billing_interval ?? null
  if (row?.stripe_subscription_id) {
    try {
      const stripe = getStripe()
      const live = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      const lookup: Record<string, SubStatus> = {
        trialing: 'trialing',
        active: 'active',
        past_due: 'past_due',
        canceled: 'canceled',
        incomplete: 'incomplete',
        incomplete_expired: 'canceled',
        unpaid: 'past_due',
        paused: 'past_due',
      }
      resolvedStatus = lookup[live.status] ?? 'incomplete'
      const interval = live.items.data[0]?.price?.recurring?.interval
      resolvedInterval = interval === 'year' ? 'year' : interval === 'month' ? 'month' : null
    } catch (e) {
      console.warn('[admin-actions.clearComp:stripe]', (e as Error).message)
    }
  }

  const { error } = await admin
    .from('outfitter_subscriptions')
    .update({
      comp_until: null,
      status: resolvedStatus,
      billing_interval: resolvedInterval,
    })
    .eq('guide_id', guideId)
  if (error) {
    console.warn('[admin-actions.clearComp:update]', error.code, error.message)
    return { error: error.message || 'Could not clear comp.' }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/revenue')
  revalidatePath(`/admin/guides/${guideId}`)
  return { ok: true }
}

// 3. Force-reactivate a canceled Stripe subscription. Creates a fresh
// subscription on the existing customer at the last-known interval
// (defaults to 'month' when unknown). Requires a default payment
// method on file — we don't enter card details on the guide's
// behalf. If no PM is present, return a clean error directing the
// admin to send the guide back through checkout.
export async function forceReactivateAction(
  guideId: string,
): Promise<AdminActionResult> {
  const { profile } = await requireAdmin()
  if (!guideId) return { error: 'Missing guide id.' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, billing_interval')
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!row?.stripe_customer_id) {
    return { error: 'No Stripe customer on file. Send the guide through checkout instead.' }
  }

  const auditErr = await writeAuditRow(profile.id, 'force_reactivate', guideId, {
    prior_subscription_id: row.stripe_subscription_id ?? null,
    prior_interval: row.billing_interval ?? null,
  })
  if (auditErr) return { error: auditErr }

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Confirm a default PM exists. customer.invoice_settings is the
  // canonical source for off-session billing.
  let defaultPmId: string | null = null
  try {
    const customer = await stripe.customers.retrieve(row.stripe_customer_id)
    if (customer && !customer.deleted) {
      const pm = (customer as { invoice_settings?: { default_payment_method?: string | { id?: string } | null } }).invoice_settings?.default_payment_method
      if (typeof pm === 'string') defaultPmId = pm
      else if (pm && typeof pm === 'object' && pm.id) defaultPmId = pm.id
    }
  } catch (e) {
    console.warn('[admin-actions.reactivate:customer]', (e as Error).message)
    return { error: 'Could not read Stripe customer. Try again.' }
  }
  if (!defaultPmId) {
    return { error: 'No payment method on file. Send the guide through checkout instead.' }
  }

  // Resolve target price from last-known interval; default to monthly.
  let prices
  try {
    prices = await ensureBitebookGuidePrices()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const targetInterval: 'month' | 'year' = row.billing_interval === 'year' ? 'year' : 'month'
  const priceId = targetInterval === 'year' ? prices.annual : prices.monthly

  try {
    const newSub = await stripe.subscriptions.create({
      customer: row.stripe_customer_id,
      items: [{ price: priceId }],
      default_payment_method: defaultPmId,
      // No trial — this is a forced reactivation, not a fresh signup.
      payment_settings: { save_default_payment_method: 'on_subscription' },
    })
    // Mirror the new sub state into our row immediately so the page
    // doesn't show stale data while waiting for the webhook.
    await admin
      .from('outfitter_subscriptions')
      .update({
        status: (newSub.status === 'trialing' || newSub.status === 'active' || newSub.status === 'past_due' || newSub.status === 'canceled' || newSub.status === 'incomplete') ? newSub.status : 'incomplete',
        billing_interval: targetInterval,
        stripe_subscription_id: newSub.id,
        comp_until: null,
      })
      .eq('guide_id', guideId)
  } catch (e) {
    console.warn('[admin-actions.reactivate:create]', (e as Error).message)
    return { error: 'Stripe rejected the reactivation. Check the customer in Stripe and try again.' }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/revenue')
  revalidatePath(`/admin/guides/${guideId}`)
  return { ok: true }
}

// 4. v27.8.4 — Delete account permanently. Used to retest signup flows
// without having to mint a fresh email each time.
//
// Sequence (every step abortable on error):
//   a. requireAdmin() + admin self-delete guard
//   b. Read target's auth user (email) via service-role admin client
//   c. Block delete on admin emails (defense-in-depth — even if a non-Flavio
//      admin email is added later, you can't delete from this UI)
//   d. confirmEmail must match target's email (typed-to-confirm guard)
//   e. Write admin_actions audit row first (target_guide_id SET NULL on
//      cascade so the audit row survives the profile delete)
//   f. Best-effort cancel + delete Stripe subscription if present
//   g. Delete auth.users row → trigger cascades public.profiles via FK
//      (profiles.id REFERENCES auth.users(id) ON DELETE CASCADE)
//      Belt-and-suspenders: also delete profiles row directly.
//
// FK cascade map (audited; migration v27_8_4_relax_profile_fks_for_admin_delete
// flipped 4 NO ACTION FKs to SET NULL so the cascade doesn't get blocked):
//   • CASCADE: guide_profiles, outfitter_subscriptions, trips (and trip-
//     scoped child tables), wallet_items, docs, invitations(guide_id),
//     onboarding_progress, push_subscriptions, signing_keys, comp_accounts
//     (user_id), licenses, media, packing_checklists, trip_doc_hunter_actions,
//     trip_generated_logs, trip_reviews, trip_templates, trip_wallet_items
//   • SET NULL (audit preserved): admin_actions.target_guide_id,
//     admin_audit_logs.actor_id, comp_accounts.granted_by, private_feedback,
//     trip_participants.hunter_id, harvest_log_entries.hunter_id (v27.8.4),
//     harvest_logs.created_by (v27.8.4), invitations.accepted_by (v27.8.4),
//     trip_docs.created_by (v27.8.4)
//   • RESTRICT: admin_actions.admin_id (DB-level defense; we also block
//     admin self-delete in the action)
export async function deleteAccountAction(
  targetUserId: string,
  confirmEmail: string,
): Promise<AdminActionResult> {
  const { profile, user: callerUser } = await requireAdmin()

  if (!targetUserId) return { error: 'Missing user id.' }
  if (!confirmEmail) return { error: 'Type the email to confirm.' }

  // Self-delete guard.
  if (targetUserId === profile.id || targetUserId === callerUser.id) {
    return { error: 'Cannot delete your own account from Mission Control.' }
  }

  const admin = createAdminClient()

  // Resolve target email. auth.users is source of truth.
  let targetEmail = ''
  try {
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(targetUserId)
    if (authErr || !authUser?.user) {
      console.warn('[admin-actions.deleteAccount:authLookup]', { code: authErr?.code, message: authErr?.message })
      return { error: 'Account not found.' }
    }
    targetEmail = (authUser.user.email ?? '').toLowerCase()
  } catch (e) {
    console.warn('[admin-actions.deleteAccount:authLookup:throw]', { error: (e as Error).message })
    return { error: 'Could not look up the account.' }
  }

  // Confirm-email match (defense in depth — UI also gates the button).
  if (confirmEmail.trim().toLowerCase() !== targetEmail) {
    return { error: `Confirmation email does not match — expected ${targetEmail}` }
  }

  // Block deleting other admins.
  if (isAdminEmail(targetEmail)) {
    return { error: 'Cannot delete an admin account from this UI. Contact engineering.' }
  }

  // Pull role (audit payload) + subscription (Stripe cleanup).
  const { data: prof } = await admin
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()
  const { data: subRow } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, status')
    .eq('guide_id', targetUserId)
    .maybeSingle()

  // Audit FIRST — persists across the profile delete because
  // admin_actions.target_guide_id is SET NULL on cascade.
  const auditErr = await writeAuditRow(profile.id, 'delete_account', targetUserId, {
    target_email: targetEmail,
    target_role: prof?.role ?? null,
    had_stripe_subscription: !!subRow?.stripe_subscription_id,
    had_stripe_customer: !!subRow?.stripe_customer_id,
    deleted_at: new Date().toISOString(),
  })
  if (auditErr) return { error: auditErr }

  // Best-effort Stripe sub cancel. Failures don't block the local
  // delete — Flavio can clean up Stripe-side from the dashboard.
  if (subRow?.stripe_subscription_id) {
    try {
      const stripe = getStripe()
      await stripe.subscriptions.cancel(subRow.stripe_subscription_id, {
        invoice_now: false,
        prorate: false,
      })
    } catch (e) {
      console.warn('[admin-actions.deleteAccount:stripeCancel]', { error: (e as Error).message })
    }
  }

  // Delete the auth user (cascades public.profiles via FK; profiles
  // cascades onward per the FK map above).
  try {
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId)
    if (delErr) {
      console.warn('[admin-actions.deleteAccount:authDelete]', { code: delErr.code, message: delErr.message })
      return { error: `Auth delete failed: ${delErr.message}` }
    }
  } catch (e) {
    console.warn('[admin-actions.deleteAccount:authDelete:throw]', { error: (e as Error).message })
    return { error: 'Auth delete threw — see logs.' }
  }

  // Belt-and-suspenders explicit profile delete. No-op if the
  // auth→profile cascade already removed it.
  await admin.from('profiles').delete().eq('id', targetUserId)

  revalidatePath('/admin')
  revalidatePath('/admin/revenue')
  revalidatePath('/admin/hunters')
  revalidatePath('/admin/activity')
  return { ok: true }
}
