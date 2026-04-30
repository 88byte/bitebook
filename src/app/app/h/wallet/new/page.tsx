import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireHunter } from '../../../_lib/auth'
import WalletItemForm from '../../../_components/wallet/WalletItemForm'
import type { WalletItemType } from '../../../_lib/wallet'

type SearchParams = Promise<{ type?: string }>

const VALID_TYPES: WalletItemType[] = [
  'license', 'tag', 'permit', 'stamp', 'harvest_report_card',
]

export default async function HunterWalletNewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireHunter()
  const sp = await searchParams
  const initialType = (sp.type && VALID_TYPES.includes(sp.type as WalletItemType))
    ? (sp.type as WalletItemType)
    : 'license'

  return (
    <main className="bb-app-main">
      <Link
        href="/app/h/wallet"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to wallet
      </Link>
      <header>
        <p className="bb-page-eyebrow">Wallet</p>
        <h1 className="bb-page-title">Add to wallet</h1>
        <p className="bb-page-sub">License, tag, permit, stamp, or report card.</p>
      </header>

      <div className="bb-form-narrow mt-4">
        <WalletItemForm
          basePath="/app/h/wallet"
          initial={{
            type: initialType,
            jurisdiction: 'state',
            identifier: '',
            state: null,
            species: null,
            zone: null,
            season_year: null,
            issue_date: null,
            valid_from: '',
            valid_to: '',
            notes: null,
            archived_at: null,
            extras: null,
          }}
        />
      </div>
    </main>
  )
}
