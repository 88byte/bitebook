import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { OnboardingProgress } from '../_lib/onboarding'
import { progressLabel } from '../_lib/onboarding'

// Compact strip shown on the dashboard when the guide has not finished G0
// onboarding. Links to the full /app/welcome checklist.
export default function OnboardingBanner({ progress }: { progress: OnboardingProgress }) {
  return (
    <Link href="/app/welcome" className="bb-onboard-banner">
      <div className="bb-onboard-banner-text">
        <p className="bb-onboard-banner-eyebrow">Get set up</p>
        <p className="bb-onboard-banner-title">Finish setting up Bite Book</p>
        <p className="bb-onboard-banner-sub">{progressLabel(progress)}. Continue setup to unlock the full guide workflow.</p>
      </div>
      <span className="bb-onboard-banner-cta">
        Continue setup
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  )
}
