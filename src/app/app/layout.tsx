import { headers } from 'next/headers'
import { requireUser } from './_lib/auth'
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
//
// v28.1.0d.1: outfitter members (owners + admins with an org_id) are
// treated as the GUIDE shell regardless of profile.role. The admin
// signup flow leaves profile.role='hunter' (admin seats are free
// and were forked off the hunter signup form), so a vanilla
// role==='hunter' check sent them into HunterSidebar + HunterAppHeader,
// whose nav links all point at /app/h/*. That's why every click from
// the outfitter dashboard bounced into hunter view. They also tripped
// the guide-tier check (no outfitter_subscriptions row keyed on their
// admin user id) and would have landed on LockedInterstitial. Both
// are now bypassed for outfitter members. Org subscription state is
// tracked separately on outfitter_orgs and is the owner's bill.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser()
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  const isHunter = profile.role === 'hunter' && !isOutfitterMember

  let bannerReason: 'past_due' | 'canceled' | 'no_row' | null = null
  let lockedReason: 'incomplete' | 'no_row' | null = null

  // Outfitter members skip the guide-tier check entirely — they don't
  // have an outfitter_subscriptions row keyed on their user id (the
  // org owner's row is the org's sub). Hunters skip too. Only pure
  // guides get tier-gated here.
  if (!isHunter && !isOutfitterMember) {
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

  // v27.8.1 — ADMIN pill removed from sidebar/header. Email-match gate
  // for /admin still enforced in proxy.ts; no in-shell pill needed.

  return (
    <div className="bb-app-bg bb-app-shell">
      {isHunter ? <HunterSidebar /> : <Sidebar />}
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          {isHunter ? <HunterAppHeader /> : <AppHeader />}
        </div>
        {bannerReason && <BillingTierBanner reason={bannerReason} />}
        {lockedReason ? <LockedInterstitial reason={lockedReason} /> : children}
      </div>
    </div>
  )
}
