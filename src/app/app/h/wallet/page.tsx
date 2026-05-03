import { requireHunter } from '../../_lib/auth'
import {
  fetchWallet,
  groupByType,
  WALLET_TYPES_HUNTER,
  WALLET_TYPES_HUNTER_PRIMARY,
  WALLET_TYPES_HUNTER_SECONDARY,
} from '../../_lib/wallet'
import WalletPage from '../../_components/wallet/WalletPage'

// v27.0a: hunter wallet route. Hunters cannot be issued guide credentials in
// real life, so we hard-lock the view to hunter-type items + tabs. Any
// guide-type rows from stale test data are filtered out at the view layer
// (data not deleted — just hidden). Guide-side auto-reveal logic stays
// intact for users with role='guide' since guides can also hunt personally.
//
// v27.1.5.2 — primary/secondary split. License + Tag render by default;
// Permit / Stamp / Harvest Report Card collapse under a "More types"
// toggle in WalletPage (auto-expanded when the hunter has any items in
// those types so we don't accidentally hide active inventory).
export default async function HunterWalletPage() {
  const { user, profile } = await requireHunter()
  const allItems = await fetchWallet(profile.id)
  const items = allItems.filter((i) => WALLET_TYPES_HUNTER.includes(i.type))
  const groups = groupByType(items)
  // v27.0b.7.2: holder name passed through for any guide_license cards
  // (hunter-side wallet won't show guide_license, but harmless to pass).
  const holderName =
    profile.display_name?.trim() || user.email?.split('@')[0] || null
  return (
    <WalletPage
      basePath="/app/h/wallet"
      tabs={WALLET_TYPES_HUNTER_PRIMARY}
      secondaryTabs={WALLET_TYPES_HUNTER_SECONDARY}
      groups={groups}
      holderName={holderName}
    />
  )
}
