import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { requireHunter } from '../../../_lib/auth'
import { fetchSpecies } from '../../../_lib/queries'
import WalletItemForm from '../../../_components/wallet/WalletItemForm'
import type { WalletItemType } from '../../../_lib/wallet'

// v27.0b.6: action-needed card on hunter trip detail deep-links here with
// ?type=tag&state=CA. Both params prefill the form so the hunter only fills
// out the unique fields.
//
// v27.6.3.5 item 5 — top-action-row submit pattern (same as
// /app/trips/new + /app/wallet/new). WalletItemForm renders with
// hideInlineActions so the only submit is the page-header
// button.
type SearchParams = Promise<{ type?: string; state?: string }>

const VALID_TYPES: WalletItemType[] = [
  'license', 'tag', 'permit', 'stamp', 'harvest_report_card',
]

export default async function HunterWalletNewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { profile } = await requireHunter()
  const sp = await searchParams
  const initialType = (sp.type && VALID_TYPES.includes(sp.type as WalletItemType))
    ? (sp.type as WalletItemType)
    : 'license'
  const initialState =
    sp.state && /^[A-Z]{2}$/.test(sp.state.toUpperCase()) ? sp.state.toUpperCase() : null
  const speciesOptions = await fetchSpecies()

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
          basePath="/app/h/wallet"
          userId={profile.id}
          speciesOptions={speciesOptions}
          formId="wallet-new-form"
          hideInlineActions
          initial={{
            type: initialType,
            jurisdiction: 'state',
            identifier: '',
            state: initialState,
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
