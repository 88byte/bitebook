'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  FileText,
  Tag,
  FileSignature,
  Stamp,
  ClipboardList,
  Award,
  ShieldCheck,
  BadgeCheck,
  Plus,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  TYPE_LABEL,
  TYPE_LABEL_SINGULAR,
  bucketByStatus,
  type WalletItemType,
  type WalletItemWithStatus,
} from '../../_lib/wallet-utils'
import WalletHeroCard from './WalletHeroCard'
import WalletDeck from './WalletDeck'

// Per-type icons used on stat cards (copper-filled circle, white icon).
// Selections per Flavio's v27.0a.6 spec.
const TAB_ICONS: Record<WalletItemType, LucideIcon> = {
  license: FileText,
  tag: Tag,
  permit: FileSignature,
  stamp: Stamp,
  harvest_report_card: ClipboardList,
  guide_license: Award,
  insurance: ShieldCheck,
  business_credential: BadgeCheck,
}

// Eyebrow on the hero card, uppercase per mockup.
const TYPE_EYEBROW: Record<WalletItemType, string> = {
  license: 'Hunting License',
  tag: 'Tag',
  permit: 'Permit',
  stamp: 'Stamp',
  harvest_report_card: 'Harvest Report Card',
  guide_license: 'Guide License',
  insurance: 'Insurance',
  business_credential: 'Business Credential',
}

type Props = {
  /** Path prefix for "Add new" / edit links — '/app/h/wallet' or '/app/wallet'. */
  basePath: '/app/h/wallet' | '/app/wallet'
  /** Primary tabs — always visible. */
  tabs: WalletItemType[]
  /** v27.1.5.2: secondary tabs collapsed under a "More types" toggle.
   * Currently only used by the hunter wallet for permit / stamp /
   * harvest_report_card. Auto-expanded on mount when any secondary
   * type already has items so we never accidentally hide active
   * inventory. Guide wallet passes [] (or omits) to keep all three of
   * its types primary. */
  secondaryTabs?: WalletItemType[]
  /** Items grouped by type. */
  groups: Map<WalletItemType, WalletItemWithStatus[]>
  /** v27.0b.7.2: current user's display name (or email-local fallback).
   * Threaded into hero cards for the LICENSE HOLDER slot on
   * guide_license cards. */
  holderName?: string | null
}

export default function WalletPage({
  basePath,
  tabs,
  secondaryTabs = [],
  groups,
  holderName,
}: Props) {
  // v27.0b.7: persist active tab in URL ?type=. Hydrates from the current
  // search params on mount so a refresh / back-from-edit lands on the
  // tab the user was viewing. Falls back to first tab if param missing
  // or invalid.
  // v27.1.5.2: secondary tabs (hunter Permit / Stamp / Report Card) are
  // accepted as valid initial tabs too — if the user's URL points at one,
  // we honor it AND auto-expand the More-types section so the
  // corresponding stat card is on screen.
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const allTabs = [...tabs, ...secondaryTabs]
  const initialTab = (() => {
    const t = search.get('type')
    if (t && (allTabs as readonly string[]).includes(t)) return t as WalletItemType
    return tabs[0] ?? 'license'
  })()
  const [activeTab, setActiveTab] = useState<WalletItemType>(initialTab)

  // v27.1.5.2: "More types" disclosure. Default-expanded when any
  // secondary type already has items (so a hunter who's added a stamp
  // doesn't have to re-discover the stamp tab on next visit) OR when
  // the URL's ?type= points at one of the secondary tabs. Otherwise
  // collapsed — License + Tag are the everyday view.
  const initialMoreOpen =
    secondaryTabs.length > 0 &&
    (secondaryTabs.some((t) => (groups.get(t) ?? []).length > 0) ||
      (secondaryTabs as readonly string[]).includes(initialTab))
  const [moreOpen, setMoreOpen] = useState<boolean>(initialMoreOpen)

  // Push the new tab into the URL whenever the user switches. Use
  // router.replace so back/forward isn't polluted with every tab toggle.
  useEffect(() => {
    const sp = new URLSearchParams(search.toString())
    if (sp.get('type') === activeTab) return
    sp.set('type', activeTab)
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const items = groups.get(activeTab) ?? []
  const buckets = bucketByStatus(items)
  const Icon = TAB_ICONS[activeTab]

  // Counts shown on stats grid + pill chips. v27.0b.6: only active items
  // count toward the top-of-page counters. Tagged-out / expired / archived
  // items still appear in their respective sections below but no longer
  // inflate the active counter — Flavio's spec: counter must reflect
  // what's actually USABLE right now.
  function countFor(type: WalletItemType): number {
    return (groups.get(type) ?? []).filter((i) => i.status === 'active').length
  }

  return (
    <main className="bb-app-main">
      <WalletHero basePath={basePath} activeTab={activeTab} />

      {/* v27.3.2.1: Add wallet item CTA at the TOP of the page (above
          stats), matching the Create trip / Upload doc pattern from
          v27.3.0+ and Flavio's spec for v27.3.2.1. */}
      <WalletAddCta basePath={basePath} activeTab={activeTab} />

      {/* v27.3.3: divider after top CTA. */}
      <div className="bb-page-divider mt-4" aria-hidden="true" />

      {/* Stats grid — paper cards, one per visible type, copper border on
          active. Each card has a small copper-filled circle with a white
          per-type icon, big count, uppercase label. Tap selects type. This
          is the SOLE type selector — pill chips were removed in v27.0a.6
          since they duplicated this control. */}
      <div className="bb-wallet-stats mt-3" role="tablist" aria-label="Wallet category counts">
        {[...tabs, ...(moreOpen ? secondaryTabs : [])].map((t) => {
          const isActive = activeTab === t
          const TypeIcon = TAB_ICONS[t]
          return (
            <button
              key={`stat-${t}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t)}
              className={`bb-wallet-stat-card ${isActive ? 'is-active' : ''}`}
            >
              <span className="bb-wallet-stat-icon" aria-hidden="true">
                <TypeIcon size={14} strokeWidth={2.2} />
              </span>
              <span className="bb-wallet-stat-count">{countFor(t)}</span>
              <span className="bb-wallet-stat-label">{TYPE_LABEL[t]}</span>
            </button>
          )
        })}
      </div>

      {/* v27.1.5.2: "More types" toggle for secondary tabs (hunter
          permit / stamp / harvest_report_card). Hidden entirely when
          there are no secondary tabs to show (guide wallet). */}
      {secondaryTabs.length > 0 && (
        <div
          className="mt-2"
          style={{ display: 'flex', justifyContent: 'flex-start' }}
        >
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="bb-text-action bb-text-action-copper"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontSize: '0.78rem',
            }}
          >
            {moreOpen ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Hide other types
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                More types
              </>
            )}
          </button>
        </div>
      )}

      {/* ACTIVE section */}
      <WalletStatusSection
        title="Active"
        count={buckets.active.length}
        items={buckets.active}
        basePath={basePath}
        type={activeTab}
        emptyIcon={Icon}
        emptyTitle={`No active ${TYPE_LABEL[activeTab].toLowerCase()}`}
        emptySub="When you add one, it'll show up here."
        holderName={holderName}
      />

      {/* DONE — only render for tags. v27.1.5.3: rebadged from "Tagged
          out" so a finished tag reads with the same vocabulary as a
          completed trip — both surface as "Done" everywhere they
          render. The underlying bucket key (tagged_out) stays for code
          clarity since it describes the data attribute (tagged_out_at
          set), not the user-facing label. */}
      {activeTab === 'tag' && buckets.tagged_out.length > 0 && (
        <WalletStatusSection
          title="Done"
          count={buckets.tagged_out.length}
          items={buckets.tagged_out}
          basePath={basePath}
          type={activeTab}
          emptyIcon={Icon}
          emptyTitle="Nothing done yet"
          emptySub=""
          holderName={holderName}
        />
      )}

      {/* EXPIRED section */}
      <WalletStatusSection
        title="Expired"
        count={buckets.expired.length}
        items={buckets.expired}
        basePath={basePath}
        type={activeTab}
        emptyIcon={CalendarCheck}
        emptyTitle={`No expired ${TYPE_LABEL[activeTab].toLowerCase()}`}
        emptySub="You're all caught up."
        holderName={holderName}
      />

      {/* Archived — small text link to view archived (deferred full surface) */}
      {buckets.archived.length > 0 && (
        <p className="mt-4" style={{ textAlign: 'center' }}>
          <span className="bb-form-help">
            {buckets.archived.length} archived item{buckets.archived.length === 1 ? '' : 's'}
          </span>
        </p>
      )}
    </main>
  )
}

function WalletHero({
  basePath,
  activeTab,
}: {
  basePath: string
  activeTab: WalletItemType
}) {
  return (
    <section className="bb-wallet-hero">
      <Image
        src="/bb-wallet-hero.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 64rem"
        className="bb-wallet-hero-img"
      />
      <div className="bb-wallet-hero-overlay" />
      <div className="bb-wallet-hero-inner">
        <div className="bb-wallet-hero-text">
          <p className="bb-page-eyebrow">Your wallet</p>
          <h1 className="bb-page-title bb-wallet-hero-title">Wallet</h1>
          <p className="bb-page-sub">Licenses, tags, and credentials in one place.</p>
        </div>
        {/* v27.0b.8: Add button relocated to underneath the stat counters
            (rendered separately as <WalletAddCta />). The hero now only
            shows title + subtitle. */}
      </div>
    </section>
  )
}

// v27.0b.8 / .8.1: Add button as its own row below the stats grid.
// v27.0b.8.1: label reverted to generic "+ Add New Card". Hunter can
// pick any type from the form regardless of current tab; "card" matches
// the mental model used everywhere else in the wallet UI.
function WalletAddCta({
  basePath,
  activeTab,
}: {
  basePath: string
  activeTab: WalletItemType
}) {
  return (
    <div className="mt-3" style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <Link
        href={`${basePath}/new?type=${activeTab}`}
        className="bb-cta-sm"
        aria-label="Add new card"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Plus size={16} aria-hidden="true" />
        Add New Card
      </Link>
    </div>
  )
}

function WalletStatusSection({
  title,
  count,
  items,
  basePath,
  type,
  emptyIcon,
  emptyTitle,
  emptySub,
  holderName,
}: {
  title: string
  count: number
  items: WalletItemWithStatus[]
  basePath: string
  type: WalletItemType
  emptyIcon: LucideIcon
  emptyTitle: string
  emptySub: string
  holderName?: string | null
}) {
  // v27.0a.10: "View all" toggle — flips the deck into a vertical stack of
  // every card in this status bucket. Deck (idle) shows top + 2 peeks;
  // expanded shows everything full-width.
  // v27.3.4: on desktop (>=1024px) we always render the grid instead of
  // the deck. The deck pattern is mobile-touch-first; on a wide shell
  // the stretched single card reads as a banner. Auto-detected via
  // matchMedia so the grid kicks in immediately at lg+ without forcing
  // the user to tap "View all."
  const [expanded, setExpanded] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 64rem)')
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const showGrid = expanded || isDesktop

  return (
    <section className="bb-wallet-section mt-4">
      <div className="bb-wallet-section-head">
        <span className="bb-wallet-section-title">
          {title} ({count})
        </span>
        {items.length > 1 && !isDesktop && (
          <button
            type="button"
            className="bb-text-action bb-text-action-copper"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : 'View all'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} sub={emptySub} />
      ) : showGrid ? (
        <div className="bb-wallet-stack">
          {items.map((item) => (
            <WalletHeroCard
              key={item.id}
              item={item}
              basePath={basePath}
              eyebrow={TYPE_EYEBROW[type]}
              holderName={holderName}
            />
          ))}
        </div>
      ) : (
        <WalletDeck
          items={items}
          basePath={basePath}
          eyebrow={TYPE_EYEBROW[type]}
          type={type}
          holderName={holderName}
          ariaLabel={`${title} ${TYPE_LABEL[type]} cards`}
        />
      )}
    </section>
  )
}

function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon
  title: string
  sub: string
}) {
  return (
    <div className="bb-wallet-empty">
      <span className="bb-wallet-empty-icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <p className="bb-wallet-empty-title">{title}</p>
      {sub && <p className="bb-wallet-empty-sub">{sub}</p>}
    </div>
  )
}

