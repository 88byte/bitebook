import { headers } from 'next/headers'
import { requireUser, isAdminEmail } from './_lib/auth'
import { getGuideTier } from './_lib/billing-tier'
import AppHeader from './_components/AppHeader'
import HunterAppHeader from './_components/HunterAppHeader'
import Sidebar from './_components/Sidebar'
import HunterSidebar from './_components/HunterSidebar'
import BillingTierBanner from './_components/BillingTierBanner'
import LockedInterstitial from './_components/LockedInterstitial'

// Shared shell for /app/* routes.
//
// v25.2: role-aware shell. Previously this layout always rendered the guide
// Sidebar + AppHeader, and /app/h/layout.tsx rendered an additional
// HunterSidebar + HunterAppHeader on top — Next.js composes parent + nested
// layouts, so hunters saw BOTH shells stacked. We now read the role here and
// pick the correct shell once. /app/h/layout.tsx is a pass-through.
//
// v27.4.3: subscription-tier gating. For guides we pull getGuideTier() (DB
// read deduped via React cache so action-level callers don't re-query)
// and:
//   - read_only (past_due / canceled) → render BillingTierBanner above
//     children. Children still render so existing trips/reports stay
//     viewable; the action-level gate blocks writes.
//   - locked (incomplete / no_row) → swap children for LockedInterstitial
//     UNLESS we're inside /app/settings (so they can fix billing) or
//     /app/support (so they can email us). The path comes via the
//     x-bb-pathname header set by proxy.ts.
//
// Hunters are never tier-gated here. Their access depends on the
// inviting guide's tier, enforced separately in accept-invite/route.ts.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser()
  const isHunter = profile.role === 'hunter'

  let bannerReason: 'past_due' | 'canceled' | 'no_row' | null = null
  let lockedReason: 'incomplete' | 'no_row' | null = null

  if (!isHunter) {
    const tier = await getGuideTier(profile.id)
    if (tier.tier === 'read_only') {
      bannerReason = tier.reason === 'past_due' || tier.reason === 'canceled'
        ? tier.reason
        : null
    } else if (tier.tier === 'locked') {
      const h = await headers()
      const pathname = h.get('x-bb-pathname') ?? ''
      const isEscapeHatch =
        pathname.startsWith('/app/settings') ||
        pathname.startsWith('/app/support')
      if (!isEscapeHatch) {
        lockedReason = tier.reason === 'incomplete' || tier.reason === 'no_row'
          ? tier.reason
          : 'incomplete'
      }
    }
  }

  // v27.6.0.1 / v27.6.0.2 — admin determination is email-based, not
  // role-based. Role-based admin assignment broke /app access in
  // v27.6.0 because requireGuide() rejects role !== 'guide'. Now
  // a guide can also be admin without losing app access; the
  // ADMIN pill + Mission Control link surface for any signed-in
  // user whose email is in the ADMIN_EMAILS list.
  const isAdmin = isAdminEmail(user.email ?? null)

  return (
    <div className="bb-app-bg bb-app-shell">
      {isHunter ? <HunterSidebar /> : <Sidebar isAdmin={isAdmin} />}
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          {isHunter ? <HunterAppHeader /> : <AppHeader isAdmin={isAdmin} />}
        </div>
        {bannerReason && <BillingTierBanner reason={bannerReason} />}
        {lockedReason ? <LockedInterstitial reason={lockedReason} /> : children}
      </div>
    </div>
  )
}
