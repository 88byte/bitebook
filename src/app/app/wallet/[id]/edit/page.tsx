import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../../_lib/auth'
import WalletItemForm from '../../../_components/wallet/WalletItemForm'
import { createClient } from '@/lib/supabase/server'

type RouteParams = Promise<{ id: string }>

export default async function GuideWalletEditPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()
  const sb = await createClient()
  const { data: item } = await sb
    .from('wallet_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (!item) notFound()

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
        <h1 className="bb-page-title">Edit wallet item</h1>
      </header>

      <div className="bb-form-narrow mt-4">
        <WalletItemForm
          basePath="/app/wallet"
          initial={{
            id: item.id,
            type: item.type,
            jurisdiction: item.jurisdiction,
            identifier: item.identifier,
            state: item.state,
            species: item.species,
            zone: item.zone,
            season_year: item.season_year,
            issue_date: item.issue_date,
            valid_from: item.valid_from,
            valid_to: item.valid_to,
            notes: item.notes,
            archived_at: item.archived_at,
            extras: (item.extras as Record<string, string> | null) ?? null,
          }}
        />
      </div>
    </main>
  )
}
