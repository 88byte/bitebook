import { requireHunter } from '../../_lib/auth'
import { fetchWallet, groupByType, visibleTabs } from '../../_lib/wallet'
import WalletPage from '../../_components/wallet/WalletPage'

// v27.0a: hunter wallet route. Same shared component as guide side; visible
// tabs adapt to role + present items (role-adaptive per sequencing doc §7.2).
export default async function HunterWalletPage() {
  const { profile } = await requireHunter()
  const items = await fetchWallet(profile.id)
  const groups = groupByType(items)
  const tabs = visibleTabs('hunter', groups)
  return <WalletPage basePath="/app/h/wallet" tabs={tabs} groups={groups} />
}
