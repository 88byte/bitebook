import Link from 'next/link'
import { Check, Circle, Lock, ArrowRight } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import {
  ONBOARDING_STEPS,
  fetchOnboardingProgress,
  isOnboarded,
  progressLabel,
} from '../_lib/onboarding'

export default async function WelcomePage() {
  const { supabase, user } = await requireGuide()
  const progress = await fetchOnboardingProgress(supabase, user.id)
  const allDone = isOnboarded(progress)

  // First incomplete step is "current"; everything after it is "locked".
  const firstIncomplete = ONBOARDING_STEPS.findIndex((s) => !progress.steps_completed.includes(s.id))

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Get set up</p>
        <h1 className="bb-page-title">Welcome to Bite Book</h1>
        <p className="bb-page-sub">{progressLabel(progress)}. Three quick steps and you are running.</p>
      </header>

      <section className="mt-4 bb-tile">
        <div className="bb-tile-body">
          <ol className="bb-onboard-list">
            {ONBOARDING_STEPS.map((step, i) => {
              const done = progress.steps_completed.includes(step.id)
              const current = !done && i === firstIncomplete
              const locked = !done && !current

              return (
                <li key={step.id} className={`bb-onboard-step is-${done ? 'done' : current ? 'current' : 'locked'}`}>
                  <div className="bb-onboard-step-icon" aria-hidden="true">
                    {done ? <Check size={16} /> : locked ? <Lock size={14} /> : <Circle size={14} />}
                  </div>
                  <div className="bb-onboard-step-body">
                    <div className="bb-onboard-step-label">{step.label}</div>
                    {current && (
                      <Link href={step.href} className="bb-cta-sm mt-2 inline-flex">
                        Start
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {allDone && (
            <div className="bb-empty mt-4">
              <div className="bb-empty-title">You are all set</div>
              <p className="bb-empty-sub">Head back to the dashboard to plan your next trip.</p>
              <Link href="/app" className="bb-cta-sm mt-3 inline-flex">
                Go to dashboard
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* v25.9: 1-tap support link for mobile users (sidebar is hidden <1024px). */}
      <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
        Need a hand? <Link href="/app/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>Help</Link>
      </p>
    </main>
  )
}
