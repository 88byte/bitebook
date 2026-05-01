import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchSpecies } from '../../_lib/queries'
import WalletItemForm from '../../_components/wallet/WalletItemForm'
import type { WalletItemType } from '../../_lib/wallet'

type SearchParams = Promise<{ type?: string }>

const VALID_TYPES: WalletItemType[] = [
  'license', 'tag', 'permit', 'stamp', 'harvest_report_card',
  'guide_license', 'insurance', 'business_credential',
]

export default async function GuideWalletNewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { profile } = await requireGuide()
  const sp = await searchParams
  const initialType = (sp.type && VALID_TYPES.includes(sp.type as WalletItemType))
    ? (sp.type as WalletItemType)
    : 'guide_license'
  const speciesOptions = await fetchSpecies()

  return (
    <main className="bb-app-main">
      <Link
        href="/app/wallet"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to wallet
      </Link>
      <header>
        <p className="bb-page-eyebrow">Wallet</p>
        <h1 className="bb-page-title">Add to wallet</h1>
        <p className="bb-page-sub">Guide license, insurance, credentials — or your own hunter items.</p>
      </header>

      <div className="bb-form-narrow mt-4">
        <WalletItemForm
          basePath="/app/wallet"
          userId={profile.id}
          speciesOptions={speciesOptions}
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
            document_url: null,
          }}
        />
      </div>
    </main>
  )
}
