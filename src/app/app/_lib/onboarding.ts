import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// G0 onboarding step list. Order = the order shown on /app/welcome and the
// order they unlock in (each step is "locked" until the previous is done).
export const ONBOARDING_STEPS = [
  { id: 'profile_set',    label: 'Set up your guide profile', href: '/app/settings' },
  { id: 'hunter_invited', label: 'Invite your first hunter',  href: '/app/hunters' },
  { id: 'first_trip',     label: 'Log your first trip',       href: '/app/trips/new' },
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id']

export type OnboardingProgress = {
  steps_completed: string[]
  completed_at: string | null
}

type Sb = SupabaseClient<Database>

// Read progress, creating the row if missing. Idempotent — safe to call on
// every dashboard render.
export async function fetchOnboardingProgress(supabase: Sb, userId: string): Promise<OnboardingProgress> {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('steps_completed, completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[onboarding.fetchOnboardingProgress]', { userId, code: error.code, message: error.message })
    return { steps_completed: [], completed_at: null }
  }
  if (data) return { steps_completed: data.steps_completed ?? [], completed_at: data.completed_at }

  // Lazy-create the row on first read so subsequent writes can update.
  const { data: created } = await supabase
    .from('onboarding_progress')
    .insert({ user_id: userId, steps_completed: [] })
    .select('steps_completed, completed_at')
    .maybeSingle()
  return { steps_completed: created?.steps_completed ?? [], completed_at: created?.completed_at ?? null }
}

export async function markStepDone(
  supabase: Sb,
  userId: string,
  stepId: OnboardingStepId
): Promise<void> {
  const current = await fetchOnboardingProgress(supabase, userId)
  if (current.steps_completed.includes(stepId)) return

  const next = Array.from(new Set([...current.steps_completed, stepId]))
  const allDone = ONBOARDING_STEPS.every((s) => next.includes(s.id))
  const completedAt = allDone ? (current.completed_at ?? new Date().toISOString()) : current.completed_at

  const { error } = await supabase
    .from('onboarding_progress')
    .update({ steps_completed: next, completed_at: completedAt })
    .eq('user_id', userId)

  if (error) {
    console.warn('[onboarding.markStepDone]', { userId, stepId, code: error.code, message: error.message })
  }
}

export function isOnboarded(progress: OnboardingProgress): boolean {
  return ONBOARDING_STEPS.every((s) => progress.steps_completed.includes(s.id))
}

export function progressLabel(progress: OnboardingProgress): string {
  const done = ONBOARDING_STEPS.filter((s) => progress.steps_completed.includes(s.id)).length
  return `${done} of ${ONBOARDING_STEPS.length} done`
}
