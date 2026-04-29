'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  IdCard,
  Crosshair,
  ScrollText,
  Stamp,
  ClipboardList,
  Wallet as WalletIcon,
  ShieldCheck,
  Award,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  TYPE_LABEL,
  TYPE_LABEL_SINGULAR,
  bucketByStatus,
  type StatusGroup,
  type WalletItemType,
  type WalletItemWithStatus,
} from '../../_lib/wallet-utils'

const TAB_ICONS: Record<WalletItemType, LucideIcon> = {
  license: IdCard,
  tag: Crosshair,
  permit: ScrollText,
  stamp: Stamp,
  harvest_report_card: ClipboardList,
  guide_license: WalletIcon,
  insurance: ShieldCheck,
  business_credential: Award,
}

type Props = {
  /** Path prefix for "Add new" / edit links — '/app/h/wallet' or '/app/wallet'. */
  basePath: '/app/h/wallet' | '/app/wallet'
  /** Tabs to render, in display order. */
  tabs: WalletItemType[]
  /** Items grouped by type. */
  groups: Map<WalletItemType, WalletItemWithStatus[]>
}

const STATUS_LABEL: Record<StatusGroup, string> = {
  active: 'Active',
  tagged_out: 'Tagged out',
  expired: 'Expired',
  archived: 'Archived',
}

export default function WalletPage({ basePath, tabs, groups }: Props) {
  const [activeTab, setActiveTab] = useState<WalletItemType>(tabs[0] ?? 'license')

  const items = groups.get(activeTab) ?? []
  const buckets = bucketByStatus(items)
  const Icon = TAB_ICONS[activeTab]

  // Tagged-out only renders for tags. v27.0a: empty until v27.0b adds harvest consumption.
  const groupOrder: StatusGroup[] =
    activeTab === 'tag'
      ? ['active', 'tagged_out', 'expired', 'archived']
      : ['active', 'expired', 'archived']

  return (
    <main className="bb-app-main">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">Your wallet</p>
          <h1 className="bb-page-title">Wallet</h1>
          <p className="bb-page-sub">Licenses, tags, and credentials in one place.</p>
        </div>
        <Link
          href={`${basePath}/new?type=${activeTab}`}
          className="bb-cta-sm"
          aria-label={`Add ${TYPE_LABEL_SINGULAR[activeTab]}`}
        >
          <Plus size={16} aria-hidden="true" />
          Add
        </Link>
      </header>

      <div className="bb-wallet-tabs mt-4" role="tablist" aria-label="Wallet item type">
        {tabs.map((t) => {
          const TabIcon = TAB_ICONS[t]
          const count = (groups.get(t) ?? []).filter((i) => i.status !== 'archived').length
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={activeTab === t}
              onClick={() => setActiveTab(t)}
              className={`bb-wallet-tab ${activeTab === t ? 'is-active' : ''}`}
            >
              <TabIcon size={16} aria-hidden="true" />
              <span>{TYPE_LABEL[t]}</span>
              {count > 0 && <span className="bb-wallet-tab-count">{count}</span>}
            </button>
          )
        })}
      </div>

      <section className="mt-4 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState type={activeTab} basePath={basePath} icon={Icon} />
        ) : (
          groupOrder.map((g) => {
            const list = buckets[g]
            if (list.length === 0 && g !== 'active') return null
            return (
              <StatusGroupSection
                key={g}
                group={g}
                items={list}
                basePath={basePath}
                showBulkArchive={g === 'expired' && list.length > 1}
              />
            )
          })
        )}
      </section>
    </main>
  )
}

function EmptyState({
  type,
  basePath,
  icon: Icon,
}: {
  type: WalletItemType
  basePath: string
  icon: LucideIcon
}) {
  return (
    <div className="bb-empty">
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: '999px',
          background: 'rgba(176, 108, 60, 0.1)',
          color: 'var(--color-copper)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 0.75rem',
        }}
      >
        <Icon size={24} aria-hidden="true" />
      </div>
      <div className="bb-empty-title">No {TYPE_LABEL[type].toLowerCase()} yet</div>
      <p className="bb-empty-sub">
        Add your {TYPE_LABEL_SINGULAR[type].toLowerCase()} so it&rsquo;s ready when you need it.
      </p>
      <Link href={`${basePath}/new?type=${type}`} className="bb-cta-sm mt-3 inline-flex">
        <Plus size={16} aria-hidden="true" />
        Add {TYPE_LABEL_SINGULAR[type].toLowerCase()}
      </Link>
    </div>
  )
}

function StatusGroupSection({
  group,
  items,
  basePath,
  showBulkArchive,
}: {
  group: StatusGroup
  items: WalletItemWithStatus[]
  basePath: string
  showBulkArchive: boolean
}) {
  const [open, setOpen] = useState(group !== 'archived')

  return (
    <div className="bb-tile bb-form-section">
      <div className="bb-tile-body">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="bb-wallet-status-head"
          aria-expanded={open}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="bb-form-section-head" style={{ margin: 0 }}>
              {STATUS_LABEL[group]} ({items.length})
            </span>
          </span>
          {showBulkArchive && open && (
            <button
              type="button"
              className="bb-text-action bb-text-action-copper"
              onClick={(e) => {
                e.stopPropagation()
                // Bulk archive — wired in a follow-up commit; UI placeholder for now
                console.log('TODO: bulk archive expired')
              }}
            >
              Archive all
            </button>
          )}
        </button>

        {open && (
          <div className="bb-detail-list mt-2">
            {items.length === 0 ? (
              <p className="bb-form-help">No {STATUS_LABEL[group].toLowerCase()} items.</p>
            ) : (
              items.map((item) => <WalletRow key={item.id} item={item} basePath={basePath} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WalletRow({ item, basePath }: { item: WalletItemWithStatus; basePath: string }) {
  const subParts = [
    item.state ?? null,
    item.species ?? null,
    item.zone ? `Zone ${item.zone}` : null,
    item.season_year ? `${item.season_year}` : null,
  ].filter(Boolean)
  const validToFmt = new Date(item.valid_to).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <Link href={`${basePath}/${item.id}/edit`} className="bb-detail-row" style={{ textDecoration: 'none' }}>
      <div className="flex-1 min-w-0">
        <div className="bb-detail-name" style={{ overflowWrap: 'anywhere' }}>
          {item.identifier}
        </div>
        <div className="bb-detail-sub" style={{ overflowWrap: 'anywhere' }}>
          {subParts.length > 0 ? subParts.join(' · ') : TYPE_LABEL_SINGULAR[item.type]}
        </div>
        <div className="bb-detail-sub" style={{ marginTop: '0.15rem' }}>
          Valid through {validToFmt}
          {item.jurisdiction === 'federal' && ' · Federal'}
        </div>
      </div>
    </Link>
  )
}
