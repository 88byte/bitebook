import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// G0 onboarding step list. Order = the order shown on /app/welcome and the
// order they unlock in (each step is "locked" until the previous is done).
export const ONBOARDING_STEPS = [
  { id: 'profile_set',    label: 'Set up your guide profile', href: '/app/settings' },
  { id: 'hunter_invited', label: 'Invite your first hunter',  href: '/app/hunters' },
  { id: 'first_trip',     label: 'Log your first trip',       href: '/app/trips/new' },
] as const

// v26.0 Batch A: hunter onboarding step list. Order matches /app/h/welcome.
//
// Step 2 (`wait_for_guide`) is data-driven — derived from EXISTS on
// trip_participants on every dashboard render rather than stored in
// onboarding_progress.steps_completed. The other two are action-driven
// (marked done by updateHunterProfileAction and the trip-detail page).
export const HUNTER_ONBOARDING_STEPS = [
  { id: 'profile_set',       label: 'Set up your profile',  href: '/app/h/profile' },
  { id: 'wait_for_guide',    label: 'Wait for your guide',  href: '/app/h/welcome' },
  { id: 'first_trip_viewed', label: 'View your first trip', href: '/app/h/trips' },
] as const

export type HunterOnboardingStepId = (typeof HUNTER_ONBOARDING_STEPS)[number]['id']

export type OnboardingStepId =
  | (typeof ONBOARDING_STEPS)[number]['id']
  | HunterOnboardingStepId

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
  // v26.0: completed_at marks "all guide steps done". The hunter checklist
  // (HUNTER_ONBOARDING_STEPS) overlaps on `profile_set` but uses different
  // step ids overall and a separate isHunterOnboarded() helper that also
  // factors in the live participant-row check, so leave completed_at as the
  // guide-side terminal flag.
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

// ─── v26.0 Batch A: hunter onboarding helpers ───────────────────────────────
//
// Hunter onboarding state is split across two sources:
//   - profile_set + first_trip_viewed → onboarding_progress.steps_completed
//     (action-driven; markStepDone fires from the relevant server action /
//     page render).
//   - wait_for_guide → derived from trip_participants on every render
//     (data-driven; no row in onboarding_progress).
//
// Why split? wait_for_guide is gated on the GUIDE doing something (adding
// the hunter to a trip). The hunter has no action to take. Storing it in
// steps_completed would either require a guide-side write (RLS gymnastics
// against another user's onboarding row) or a backfill loop. The live
// EXISTS query is cheap and removes both.

export type HunterOnboardingProgress = {
  steps_completed: string[]
  completed_at: string | null
  has_participant_row: boolean
  has_accepted_invite: boolean
}

export async function fetchHunterOnboardingProgress(
  supabase: Sb,
  userId: string
): Promise<HunterOnboardingProgress> {
  // v26.2: also derive `has_accepted_invite` from the invitations table. The
  // existing-hunter auto-accept flow (v25.7) creates an accepted invitations
  // row before any trip_participants row exists, so a hunter can be connected
  // to a guide without yet being on a trip. Recognize that as completion of
  // the wait_for_guide step.
  const [progress, participantRes, inviteRes] = await Promise.all([
    fetchOnboardingProgress(supabase, userId),
    supabase
      .from('trip_participants')
      .select('id', { count: 'exact', head: true })
      .eq('hunter_id', userId)
      .limit(1),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('accepted_by', userId)
      .eq('status', 'accepted')
      .limit(1),
  ])
  return {
    steps_completed: progress.steps_completed,
    completed_at: progress.completed_at,
    has_participant_row: (participantRes.count ?? 0) > 0,
    has_accepted_invite: (inviteRes.count ?? 0) > 0,
  }
}

export function isHunterStepDone(
  progress: HunterOnboardingProgress,
  stepId: HunterOnboardingStepId
): boolean {
  // v26.2: wait_for_guide is done if the hunter is on any trip OR has any
  // accepted invitation (existing-hunter auto-accept path).
  if (stepId === 'wait_for_guide') {
    return progress.has_participant_row || progress.has_accepted_invite
  }
  return progress.steps_completed.includes(stepId)
}

export function isHunterOnboarded(progress: HunterOnboardingProgress): boolean {
  return HUNTER_ONBOARDING_STEPS.every((s) => isHunterStepDone(progress, s.id))
}

export function hunterProgressLabel(progress: HunterOnboardingProgress): string {
  const done = HUNTER_ONBOARDING_STEPS.filter((s) => isHunterStepDone(progress, s.id)).length
  return `${done} of ${HUNTER_ONBOARDING_STEPS.length} done`
}

export function hunterDoneCount(progress: HunterOnboardingProgress): number {
  return HUNTER_ONBOARDING_STEPS.filter((s) => isHunterStepDone(progress, s.id)).length
}
