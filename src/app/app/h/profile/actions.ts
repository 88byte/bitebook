'use server'

import { revalidatePath } from 'next/cache'
import { requireHunter } from '../../_lib/auth'
import { createClient } from '@/lib/supabase/server'

export type HunterProfileActionResult =
  | { ok: true }
  | { error: string }

// v25.1: server action for /app/h/profile. Updates the hunter's profile row
// (display_name, phone). RLS gates writes to auth.uid()'s own row;
// .eq('id', user.id) is defense-in-depth.
export async function updateHunterProfileAction(formData: FormData): Promise<HunterProfileActionResult> {
  const { user } = await requireHunter()

  const display_name = String(formData.get('display_name') ?? '').trim()
  if (!display_name) return { error: 'Display name is required.' }
  if (display_name.length > 80) return { error: 'Display name is too long.' }

  const phoneRaw = String(formData.get('phone') ?? '').trim()
  const phone = phoneRaw ? phoneRaw.slice(0, 32) : null

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name, phone })
    .eq('id', user.id)

  if (error) {
    console.warn('[hunter.updateHunterProfileAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save profile.' }
  }

  revalidatePath('/app/h')
  revalidatePath('/app/h/profile')
  return { ok: true }
}
