import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchSpecies } from '../../_lib/queries'
import WalletItemForm from '../../_components/wallet/WalletItemForm'
import type { WalletItemType } from '../../_lib/wallet'

type SearchParams = Promise<{ type?: string }>

const VALID_TYPES: WalletItemType[] = [
  'license', 'tag', 'permit', 'stamp', 'harvest_report_card',
  'guide_license', 'insurance', 'business_credential',
]

// v27.6.3.5 item 5 — refactored to mirror /app/trips/new layout
// pattern (set up in v27.6.2.1). Submit button moved to a top
// action row that targets the form via form="wallet-new-form".
// WalletItemForm renders with hideInlineActions so its bottom
// Submit + Cancel disappear; Cancel is just the "Back to wallet"
// link in the eyebrow. Flavio: "the layout is from the old
// version and you'll notice even the button to submit is still
// at the bottom."
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

      {/* Top action row — primary submit (mirrors /app/trips/new). */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          form="wallet-new-form"
          className="bb-cta-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Plus size={16} aria-hidden="true" />
          Add wallet item
        </button>
      </div>

      <div className="bb-form-narrow mt-4">
        <WalletItemForm
          basePath="/app/wallet"
          userId={profile.id}
          speciesOptions={speciesOptions}
          formId="wallet-new-form"
          hideInlineActions
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
