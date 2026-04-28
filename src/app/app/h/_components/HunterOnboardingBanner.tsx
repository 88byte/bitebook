import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { HunterOnboardingProgress } from '../../_lib/onboarding'
import { hunterProgressLabel } from '../../_lib/onboarding'

// v26.0 Batch A: compact strip shown on the hunter dashboard when onboarding
// isn't finished. Links to /app/h/welcome for the full checklist. Visual
// language matches the guide-side OnboardingBanner so the shell feels
// consistent across roles.
export default function HunterOnboardingBanner({ progress }: { progress: HunterOnboardingProgress }) {
  return (
    <Link href="/app/h/welcome" className="bb-onboard-banner">
      <div className="bb-onboard-banner-text">
        <p className="bb-onboard-banner-eyebrow">Get set up</p>
        <p className="bb-onboard-banner-title">Finish setting up Bite Book</p>
        <p className="bb-onboard-banner-sub">{hunterProgressLabel(progress)}. Continue setup so your guide can pre-fill state logs for you.</p>
      </div>
      <span className="bb-onboard-banner-cta">
        Continue setup
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  )
}
