'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef, useState } from 'react'
import {
  FileText,
  Tag,
  FileSignature,
  Stamp,
  ClipboardList,
  Award,
  ShieldCheck,
  BadgeCheck,
  Crosshair,
  Plus,
  CalendarCheck,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  TYPE_LABEL,
  TYPE_LABEL_SINGULAR,
  bucketByStatus,
  type WalletItemType,
  type WalletItemWithStatus,
} from '../../_lib/wallet-utils'

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

// Per-type watermark images (Flavio-supplied via Drive). v27.0a.13: every
// wallet type now has a real image — stamps and harvest_report_card
// added, no more lucide fallbacks anywhere.
const WATERMARK_IMG: Partial<Record<WalletItemType, string>> = {
  license: '/bb-watermark-license.png',
  tag: '/bb-watermark-tag.png',
  permit: '/bb-watermark-permit.png',
  stamp: '/bb-watermark-stamp.png',
  harvest_report_card: '/bb-watermark-harvest-report.png',
  insurance: '/bb-watermark-insurance.png',
  guide_license: '/bb-watermark-insurance.png',
  business_credential: '/bb-watermark-credentials.png',
}

type Props = {
  /** Path prefix for "Add new" / edit links — '/app/h/wallet' or '/app/wallet'. */
  basePath: '/app/h/wallet' | '/app/wallet'
  /** Tabs to render, in display order. */
  tabs: WalletItemType[]
  /** Items grouped by type. */
  groups: Map<WalletItemType, WalletItemWithStatus[]>
}

export default function WalletPage({ basePath, tabs, groups }: Props) {
  const [activeTab, setActiveTab] = useState<WalletItemType>(tabs[0] ?? 'license')

  const items = groups.get(activeTab) ?? []
  const buckets = bucketByStatus(items)
  const Icon = TAB_ICONS[activeTab]

  // Counts shown on stats grid + pill chips. Excludes archived from the
  // primary count to match the mockup (archived hidden from main view).
  function countFor(type: WalletItemType): number {
    return (groups.get(type) ?? []).filter((i) => i.status !== 'archived').length
  }

  return (
    <main className="bb-app-main">
      <WalletHero basePath={basePath} activeTab={activeTab} />

      {/* Stats grid — paper cards, one per visible type, copper border on
          active. Each card has a small copper-filled circle with a white
          per-type icon, big count, uppercase label. Tap selects type. This
          is the SOLE type selector — pill chips were removed in v27.0a.6
          since they duplicated this control. */}
      <div className="bb-wallet-stats mt-3" role="tablist" aria-label="Wallet category counts">
        {tabs.map((t) => {
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
      />

      {/* TAGGED OUT — only render for tags */}
      {activeTab === 'tag' && buckets.tagged_out.length > 0 && (
        <WalletStatusSection
          title="Tagged out"
          count={buckets.tagged_out.length}
          items={buckets.tagged_out}
          basePath={basePath}
          type={activeTab}
          emptyIcon={Icon}
          emptyTitle="None tagged out"
          emptySub=""
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
        <Link
          href={`${basePath}/new?type=${activeTab}`}
          className="bb-cta-sm bb-wallet-hero-add"
          aria-label={`Add ${TYPE_LABEL_SINGULAR[activeTab]}`}
        >
          <Plus size={16} aria-hidden="true" />
          Add
        </Link>
      </div>
    </section>
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
}: {
  title: string
  count: number
  items: WalletItemWithStatus[]
  basePath: string
  type: WalletItemType
  emptyIcon: LucideIcon
  emptyTitle: string
  emptySub: string
}) {
  const [pageIndex, setPageIndex] = useState(0)
  // v27.0a.10: "View all" toggle — flips the carousel into a vertical
  // stack of every card in this status bucket. Real navigation to a
  // dedicated list page is still on the roadmap; expanding inline gives
  // the same outcome (see all without horizontal scrolling) without
  // adding a new route.
  const [expanded, setExpanded] = useState(false)
  // v27.0a.16: desktop chevron navigation. Touch scroll-snap stays
  // primary on mobile; the chevrons + keyboard arrows are an additional
  // affordance for cursor-driven viewports.
  const carouselRef = useRef<HTMLDivElement>(null)

  function scrollByCard(direction: 1 | -1) {
    const el = carouselRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' })
  }

  function onCarouselKey(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault()
      scrollByCard(1)
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      scrollByCard(-1)
    }
  }

  return (
    <section className="bb-wallet-section mt-4">
      <div className="bb-wallet-section-head">
        <span className="bb-wallet-section-title">
          {title} ({count})
        </span>
        {items.length > 1 && (
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
      ) : expanded ? (
        <div className="bb-wallet-stack">
          {items.map((item) => (
            <WalletHeroCard
              key={item.id}
              item={item}
              basePath={basePath}
              eyebrow={TYPE_EYEBROW[type]}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="bb-wallet-carousel-wrap">
            {items.length > 1 && (
              <button
                type="button"
                className="bb-wallet-nav bb-wallet-nav-prev"
                onClick={() => scrollByCard(-1)}
                aria-label="Previous card"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div
              ref={carouselRef}
              className="bb-wallet-carousel"
              tabIndex={0}
              role="region"
              aria-label={`${title} carousel`}
              onKeyDown={onCarouselKey}
              onScroll={(e) => {
                const el = e.currentTarget
                const w = el.clientWidth
                if (w > 0) setPageIndex(Math.round(el.scrollLeft / w))
              }}
            >
              {items.map((item) => (
                <WalletHeroCard
                  key={item.id}
                  item={item}
                  basePath={basePath}
                  eyebrow={TYPE_EYEBROW[type]}
                />
              ))}
            </div>
            {items.length > 1 && (
              <button
                type="button"
                className="bb-wallet-nav bb-wallet-nav-next"
                onClick={() => scrollByCard(1)}
                aria-label="Next card"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>
          {items.length > 1 && (
            <div className="bb-wallet-dots" aria-hidden="true">
              {items.map((_, i) => (
                <span
                  key={i}
                  className={`bb-wallet-dot ${i === pageIndex ? 'is-active' : ''}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function WalletHeroCard({
  item,
  basePath,
  eyebrow,
}: {
  item: WalletItemWithStatus
  basePath: string
  eyebrow: string
}) {
  const validToFmt = item.valid_to
    ? new Date(item.valid_to).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'
  const stateLine = [
    item.state ?? null,
    item.season_year ? `${item.season_year}` : null,
  ].filter(Boolean).join(' · ')
  const statusLabel =
    item.status === 'active' ? 'Active'
    : item.status === 'used' ? 'Tagged out'
    : item.status === 'expired' ? 'Expired'
    : 'Archived'

  const watermarkSrc = WATERMARK_IMG[item.type]
  // Stamps + Report Cards have no Drive image yet — fall back to the type's
  // lucide icon at large size with low opacity. Visually distinct from the
  // photo watermarks so it's obvious those types are awaiting an image.
  const FallbackIcon = TAB_ICONS[item.type] ?? Crosshair

  return (
    <Link
      href={`${basePath}/${item.id}/edit`}
      className="bb-wallet-card"
      aria-label={`${eyebrow} ${item.identifier}`}
    >
      <div className="bb-wallet-card-watermark" aria-hidden="true">
        {watermarkSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={watermarkSrc} alt="" className="bb-wallet-card-watermark-img" />
        ) : (
          <FallbackIcon size={140} strokeWidth={1.2} />
        )}
      </div>
      <div className="bb-wallet-card-top">
        <p className="bb-wallet-card-eyebrow">{eyebrow}</p>
        <h3 className="bb-wallet-card-title">{item.identifier || 'Untitled'}</h3>
        {stateLine && <p className="bb-wallet-card-sub">{stateLine}</p>}
        {item.state && (
          <p className="bb-wallet-card-state">
            {expandStateLabel(item.state)}
          </p>
        )}
      </div>
      <div className="bb-wallet-card-bottom">
        <span
          className={`bb-wallet-card-status bb-wallet-card-status-${item.status}`}
        >
          <CircleCheck size={12} aria-hidden="true" />
          {statusLabel}
        </span>
        <div className="bb-wallet-card-validity">
          <p className="bb-wallet-card-validity-eyebrow">Valid through</p>
          <p className="bb-wallet-card-validity-date">{validToFmt}</p>
        </div>
      </div>
    </Link>
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

// 2-letter US state code → "FULL NAME". Falls back to the raw value.
function expandStateLabel(state: string): string {
  const map: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  }
  return (map[state.toUpperCase()] ?? state).toUpperCase()
}
