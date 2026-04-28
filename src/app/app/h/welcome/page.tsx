import Link from 'next/link'
import { Check, Circle, Lock, ArrowRight } from 'lucide-react'
import { requireHunter } from '../../_lib/auth'
import {
  HUNTER_ONBOARDING_STEPS,
  fetchHunterOnboardingProgress,
  isHunterOnboarded,
  isHunterStepDone,
  hunterProgressLabel,
} from '../../_lib/onboarding'

// v26.0 Batch A: hunter-side welcome checklist. Mirrors /app/welcome but for
// hunters. Step 2 ("Wait for your guide") is passive — its CTA is just an
// explanation rather than a Start button.
export default async function HunterWelcomePage() {
  const { supabase, user } = await requireHunter()
  const progress = await fetchHunterOnboardingProgress(supabase, user.id)
  const allDone = isHunterOnboarded(progress)

  // First incomplete step is "current"; everything after it is "locked".
  const firstIncomplete = HUNTER_ONBOARDING_STEPS.findIndex(
    (s) => !isHunterStepDone(progress, s.id)
  )

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Get set up</p>
        <h1 className="bb-page-title">Welcome to Bite Book</h1>
        <p className="bb-page-sub">{hunterProgressLabel(progress)}. Three quick steps and you are running.</p>
      </header>

      <section className="mt-4 bb-tile">
        <div className="bb-tile-body">
          <ol className="bb-onboard-list">
            {HUNTER_ONBOARDING_STEPS.map((step, i) => {
              const done = isHunterStepDone(progress, step.id)
              const current = !done && i === firstIncomplete
              const locked = !done && !current
              const isWaitStep = step.id === 'wait_for_guide'

              return (
                <li
                  key={step.id}
                  className={`bb-onboard-step is-${done ? 'done' : current ? 'current' : 'locked'}`}
                >
                  <div className="bb-onboard-step-icon" aria-hidden="true">
                    {done ? <Check size={16} /> : locked ? <Lock size={14} /> : <Circle size={14} />}
                  </div>
                  <div className="bb-onboard-step-body">
                    <div className="bb-onboard-step-label">{step.label}</div>
                    {isWaitStep && !done && (
                      <p className="bb-form-help mt-1" style={{ marginTop: '0.4rem' }}>
                        Your guide will add you to a trip when they are ready. You will get an
                        email when that happens.
                      </p>
                    )}
                    {current && !isWaitStep && (
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
              <p className="bb-empty-sub">Head back to your dashboard to see your trips.</p>
              <Link href="/app/h" className="bb-cta-sm mt-3 inline-flex">
                Go to dashboard
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
        Need a hand? <Link href="/app/h/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>Help</Link>
      </p>
    </main>
  )
}
