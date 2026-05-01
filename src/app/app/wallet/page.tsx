import { requireGuide } from '../_lib/auth'
import { fetchWallet, groupByType, visibleTabs } from '../_lib/wallet'
import WalletPage from '../_components/wallet/WalletPage'

// v27.0a: guide wallet route. Same shared component as hunter side; visible
// tabs adapt to role + present items. Pure guide sees Guide License /
// Insurance / Credentials. If they also hunt personally on someone else's
// trip, hunter tabs (Licenses/Tags/etc.) auto-reveal once items exist.
export default async function GuideWalletPage() {
  const { user, profile } = await requireGuide()
  const items = await fetchWallet(profile.id)
  const groups = groupByType(items)
  const tabs = visibleTabs('guide', groups)
  // v27.0b.7.2: holder name for guide_license LICENSE HOLDER slot.
  // display_name → email-local-part → null fallback.
  const holderName =
    profile.display_name?.trim() || user.email?.split('@')[0] || null
  return (
    <WalletPage
      basePath="/app/wallet"
      tabs={tabs}
      groups={groups}
      holderName={holderName}
    />
  )
}
