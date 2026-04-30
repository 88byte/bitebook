import { requireHunter } from '../../_lib/auth'
import { fetchWallet, groupByType, WALLET_TYPES_HUNTER } from '../../_lib/wallet'
import WalletPage from '../../_components/wallet/WalletPage'

// v27.0a: hunter wallet route. Hunters cannot be issued guide credentials in
// real life, so we hard-lock the view to hunter-type items + tabs. Any
// guide-type rows from stale test data are filtered out at the view layer
// (data not deleted — just hidden). Guide-side auto-reveal logic stays
// intact for users with role='guide' since guides can also hunt personally.
export default async function HunterWalletPage() {
  const { profile } = await requireHunter()
  const allItems = await fetchWallet(profile.id)
  const items = allItems.filter((i) => WALLET_TYPES_HUNTER.includes(i.type))
  const groups = groupByType(items)
  return <WalletPage basePath="/app/h/wallet" tabs={WALLET_TYPES_HUNTER} groups={groups} />
}
