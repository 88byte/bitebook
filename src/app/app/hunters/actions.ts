'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireGuide } from '../_lib/auth'
import { markStepDone } from '../_lib/onboarding'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildExistingHunterAddedEmail, sendBitebookEmail } from '@/lib/email'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteActionResult =
  | { ok: true; invite_url: string; mode: 'existing_hunter' | 'new_user' }
  | { error: string }

// v25.7: lookup an existing user by email via the auth admin API. Returns
// the matching user (with banned_until + email_confirmed_at fields) or null.
//
// auth.admin.listUsers() is paginated (default 1000/page). For a V1 build
// we cap at 5 pages (~5000 users) which is well above current scale; if a
// match isn't found in that window we fall through to the new-user flow as
// a safety. Wrapped in try/catch so an admin-API hiccup never blocks an
// invite — worst case, we fall through to the existing token flow.
type AdminUser = {
  id: string
  email: string | null
  banned_until?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
}

async function findExistingAuthUser(emailLower: string): Promise<AdminUser | null> {
  try {
    const admin = createAdminClient()
    const MAX_PAGES = 5
    const PER_PAGE = 1000
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
      if (error) {
        console.warn('[hunters.findExistingAuthUser] listUsers failed', {
          page,
          message: error.message,
        })
        return null
      }
      const users = data?.users ?? []
      const match = users.find((u) => (u.email ?? '').toLowerCase() === emailLower)
      if (match) {
        return {
          id: match.id,
          email: match.email ?? null,
          banned_until: (match as { banned_until?: string | null }).banned_until ?? null,
          email_confirmed_at: match.email_confirmed_at ?? null,
          confirmed_at: (match as { confirmed_at?: string | null }).confirmed_at ?? null,
        }
      }
      // No more pages once we get fewer than perPage results.
      if (users.length < PER_PAGE) return null
    }
    return null
  } catch (e) {
    console.warn('[hunters.findExistingAuthUser] threw', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

// Server action for /app/hunters. Creates an invitation row; the DB defaults
// supply token + expires_at. Email send via Resend is best-effort; the row
// is created either way so the guide can copy the URL manually.
//
// v25.7: when the invited email already belongs to a Bite Book hunter, we
// skip the token-bearing accept-invite flow and instead create an
// already-accepted invitation row + send a "you've been added" email
// pointing at /login. This avoids forcing the hunter to re-register.
export async function inviteHunterAction(formData: FormData): Promise<InviteActionResult> {
  const { user, profile } = await requireGuide()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const firstName = String(formData.get('first_name') ?? '').trim()

  if (!email || !EMAIL_RX.test(email)) {
    return { error: 'Enter a valid email address.' }
  }

  const supabase = await createClient()

  // Build origin once — used for both the new-user accept-invite URL and
  // the existing-hunter /login URL.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'bitebook.lastbite.pro'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  // v25.7: check if this email already belongs to a Bite Book account.
  const existing = await findExistingAuthUser(email)
  const guideLabel = profile.display_name

  if (existing) {
    // Reject banned/deactivated accounts up front — they can't sign in, so
    // adding them silently would just fail at login.
    const banned = existing.banned_until
      ? new Date(existing.banned_until) > new Date()
      : false
    if (banned) {
      return {
        error:
          'This account is currently inactive. Contact support@lastbite.pro to invite this hunter.',
      }
    }

    // Use admin client to read profile (RLS-restricted: guide only sees
    // self + own participants).
    const admin = createAdminClient()
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, role, display_name')
      .eq('id', existing.id)
      .maybeSingle()

    if (existingProfile?.role === 'guide') {
      return {
        error:
          'This email is already a Bite Book Guide. Hunters and guides cannot share an account.',
      }
    }

    if (existingProfile?.role === 'hunter') {
      // Auto-accept: insert invitations row already in 'accepted' state with
      // accepted_by pointing at the existing hunter. Token still gets a
      // default value (DB default) but is never used. last_sent_at stamped
      // so resend cooldown UI won't fire if we ever surface the row.
      const { data: insertData, error: insertError } = await supabase
        .from('invitations')
        .insert({
          guide_id: profile.id,
          email,
          status: 'accepted',
          accepted_by: existing.id,
          last_sent_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError || !insertData) {
        console.warn('[hunters.inviteHunterAction] auto-accept insert failed', {
          code: insertError?.code,
          message: insertError?.message,
        })
        return {
          error: insertError?.message ?? 'Could not add this hunter to your network.',
        }
      }

      const loginUrl = `${origin}/login`
      const body = buildExistingHunterAddedEmail({ guideLabel, loginUrl })
      await sendBitebookEmail({ to: email, subject: body.subject, text: body.text })

      try {
        await markStepDone(supabase, user.id, 'hunter_invited')
      } catch (e) {
        console.warn('[hunters] onboarding mark failed', e)
      }

      revalidatePath('/app')
      revalidatePath('/app/hunters')
      return { ok: true, invite_url: loginUrl, mode: 'existing_hunter' }
    }
    // Profile missing for an existing auth user (signup-but-never-finished
    // race). Fall through to the standard new-user flow — when they accept,
    // the profile will be created.
  }

  // Standard new-user flow: create pending invitation with token.
  const { data, error } = await supabase
    .from('invitations')
    .insert({ guide_id: profile.id, email })
    .select('id, token')
    .single()

  if (error || !data) {
    console.warn('[hunters.inviteHunterAction]', { code: error?.code, message: error?.message })
    return { error: error?.message ?? 'Could not create the invitation.' }
  }

  const inviteUrl = `${origin}/accept-invite?token=${data.token}`

  // Best-effort email send via the shared helper. Reply-To is centralized
  // (support@lastbite.pro) so replies land in Flavio's monitored inbox
  // instead of the send-only bitebook subdomain. Failure does not affect
  // the row — guide can copy the invite_url manually if email fails.
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'
  await sendBitebookEmail({
    to: email,
    subject: `${guideLabel} invited you to Bite Book`,
    text: [
      greeting,
      '',
      `${guideLabel} invited you to join their guide network on Bite Book.`,
      '',
      `Accept the invite: ${inviteUrl}`,
      '',
      'This link expires in 7 days.',
    ].join('\n'),
  })

  // v24: mark onboarding step done.
  try {
    await markStepDone(supabase, user.id, 'hunter_invited')
  } catch (e) {
    console.warn('[hunters] onboarding mark failed', e)
  }

  revalidatePath('/app')
  revalidatePath('/app/hunters')
  return { ok: true, invite_url: inviteUrl, mode: 'new_user' }
}

export type CancelInviteResult = { ok: true } | { error: string }

// v25.7: soft-cancels a pending invitation. Sets status='canceled' so the
// row drops out of the Pending list and the accept-invite endpoint will
// reject the token (anything not 'pending' is treated as unusable).
export async function cancelInviteAction(formData: FormData): Promise<CancelInviteResult> {
  const { profile } = await requireGuide()

  const inviteId = String(formData.get('invite_id') ?? '').trim()
  if (!inviteId) return { error: 'Missing invite id.' }

  const supabase = await createClient()

  // Verify ownership + status before mutating. Only allow cancel on pending
  // invites — we don't void accepted/expired/revoked rows.
  const { data: invite, error: readError } = await supabase
    .from('invitations')
    .select('id, status, guide_id')
    .eq('id', inviteId)
    .eq('guide_id', profile.id)
    .maybeSingle()

  if (readError) {
    console.warn('[hunters.cancelInviteAction] read failed', {
      code: readError.code,
      message: readError.message,
    })
    return { error: 'Could not load that invite.' }
  }
  if (!invite) return { error: 'Invite not found.' }
  if (invite.status !== 'pending') {
    return { error: `Cannot cancel a ${invite.status} invite.` }
  }

  const { error: updateError } = await supabase
    .from('invitations')
    .update({ status: 'canceled' })
    .eq('id', inviteId)
    .eq('guide_id', profile.id)

  if (updateError) {
    console.warn('[hunters.cancelInviteAction] update failed', {
      code: updateError.code,
      message: updateError.message,
    })
    return { error: 'Could not cancel the invite.' }
  }

  revalidatePath('/app/hunters')
  revalidatePath('/app')
  return { ok: true }
}

export type ResendInviteResult =
  | { ok: true }
  | { error: string; cooldown_until?: string }

// Resends the invite email for a pending invitation. Reuses the original
// token (no rotation) so the link the hunter received earlier still works.
//
// v25.5: enforces a 5-minute server-side cooldown via invitations.last_sent_at
// (added in migration add_invitations_last_sent_at). The button component
// also reflects the cooldown locally for instant feedback.
export async function resendInviteAction(formData: FormData): Promise<ResendInviteResult> {
  const { profile } = await requireGuide()

  const inviteId = String(formData.get('invite_id') ?? '').trim()
  if (!inviteId) return { error: 'Missing invite id.' }

  const supabase = await createClient()

  // Verify ownership + status in one read. RLS already gates guide_id, but
  // the explicit .eq is defense-in-depth and lets us return a friendly error
  // when the invite was already accepted or revoked.
  const { data: invite, error } = await supabase
    .from('invitations')
    .select('id, email, token, status, expires_at, guide_id, last_sent_at')
    .eq('id', inviteId)
    .eq('guide_id', profile.id)
    .maybeSingle()

  if (error) {
    console.warn('[hunters.resendInviteAction] read failed', { code: error.code, message: error.message })
    return { error: 'Could not load that invite.' }
  }
  if (!invite) return { error: 'Invite not found.' }
  if (invite.status === 'accepted') return { error: 'Already accepted — no need to resend.' }
  if (invite.status === 'revoked') return { error: 'This invite was revoked.' }
  if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
    return { error: 'Invite expired. Send a new one instead.' }
  }

  // v25.5: 5-minute cooldown enforced server-side.
  const COOLDOWN_MS = 5 * 60 * 1000
  const lastSent = new Date(invite.last_sent_at).getTime()
  const cooldownUntilMs = lastSent + COOLDOWN_MS
  const remaining = cooldownUntilMs - Date.now()
  if (remaining > 0) {
    return {
      error: 'cooldown',
      cooldown_until: new Date(cooldownUntilMs).toISOString(),
    }
  }

  // Same URL the original send used — token is stable.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'bitebook.lastbite.pro'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const inviteUrl = `${proto}://${host}/accept-invite?token=${invite.token}`

  const guideLabel = profile.display_name
  const result = await sendBitebookEmail({
    to: invite.email,
    subject: `Reminder: ${guideLabel} invited you to Bite Book`,
    text: [
      'Hi,',
      '',
      `Just a reminder — ${guideLabel} invited you to join their guide network on Bite Book.`,
      '',
      `Accept the invite: ${inviteUrl}`,
      '',
      `This link expires ${new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
    ].join('\n'),
  })

  if (!result.sent && result.reason === 'send_failed') {
    // v25.6: surface the actual Resend error so the guide knows what's wrong
    // (domain not verified, API key invalid, rate-limited, etc.) instead of
    // the misleading "try again in a minute" generic. Log the full diagnostic
    // server-side; show a clean truncation to the user.
    console.warn('[hunters.resendInviteAction] email send failed', {
      code: result.code,
      status: result.status,
      message: result.error,
      inviteId: invite.id,
    })
    const detail = (result.error ?? '').trim()
    const friendly = detail.length > 0 && detail.length <= 240
      ? `Email service: ${detail}`
      : 'Email service rejected the send.'
    return { error: `${friendly} Contact support@lastbite.pro if this persists.` }
  }
  // A "not sent" result with reason 'no_api_key' is a soft success in dev
  // environments without RESEND_API_KEY. We don't surface this as an error.

  // v25.5: stamp the row so the cooldown is enforced for future resends. RLS
  // allows guide to update own invitations rows, so the user-session client
  // is sufficient — no need for the service-role admin client.
  const { error: updateError } = await supabase
    .from('invitations')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', invite.id)
  if (updateError) {
    console.warn('[hunters.resendInviteAction] last_sent_at update failed', {
      code: updateError.code,
      message: updateError.message,
    })
    // Soft-fail: the email was sent. Worst case, cooldown isn't reflected
    // until the next successful update. Don't surface to the user.
  }

  revalidatePath('/app/hunters')
  return { ok: true }
}
