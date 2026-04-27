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
