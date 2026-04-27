'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireGuide } from '../_lib/auth'
import { markStepDone } from '../_lib/onboarding'
import { createClient } from '@/lib/supabase/server'
import { sendBitebookEmail } from '@/lib/email'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteActionResult =
  | { ok: true; invite_url: string }
  | { error: string }

// Server action for /app/hunters. Creates an invitation row; the DB defaults
// supply token + expires_at. Email send via Resend is best-effort; the row
// is created either way so the guide can copy the URL manually.
export async function inviteHunterAction(formData: FormData): Promise<InviteActionResult> {
  const { user, profile } = await requireGuide()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const firstName = String(formData.get('first_name') ?? '').trim()

  if (!email || !EMAIL_RX.test(email)) {
    return { error: 'Enter a valid email address.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invitations')
    .insert({ guide_id: profile.id, email })
    .select('id, token')
    .single()

  if (error || !data) {
    console.warn('[hunters.inviteHunterAction]', { code: error?.code, message: error?.message })
    return { error: error?.message ?? 'Could not create the invitation.' }
  }

  // Build the share URL from the request origin so it works in preview
  // deploys + production without env wiring.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'bitebook.lastbite.pro'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const inviteUrl = `${proto}://${host}/accept-invite?token=${data.token}`

  // Best-effort email send via the shared helper. Reply-To is centralized
  // (support@lastbite.pro) so replies land in Flavio's monitored inbox
  // instead of the send-only bitebook subdomain. Failure does not affect
  // the row — guide can copy the invite_url manually if email fails.
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'
  const guideLabel = profile.display_name
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
  return { ok: true, invite_url: inviteUrl }
}

export type ResendInviteResult = { ok: true } | { error: string }

// Resends the invite email for a pending invitation. Reuses the original
// token (no rotation) so the link the hunter received earlier still works.
//
// v25.4 note: the `invitations` table has no `last_sent_at` / `updated_at`
// column, so this action does not enforce a server-side cooldown. The button
// component (ResendInviteButton.tsx) handles immediate-double-click via
// React state. A persistent per-invite rate-limit needs a schema change
// (add `last_sent_at TIMESTAMPTZ` to `invitations`) before it can land here
// — flagged in the audit doc.
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
    .select('id, email, token, status, expires_at, guide_id')
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
    return { error: 'Email send failed. Please try again in a minute.' }
  }
  // A "not sent" result with reason 'no_api_key' is a soft success in dev
  // environments without RESEND_API_KEY. We don't surface this as an error.

  revalidatePath('/app/hunters')
  return { ok: true }
}
