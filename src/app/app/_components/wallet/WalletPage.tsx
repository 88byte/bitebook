'use client'

import Link from 'next/link'
import DashboardHero from '../DashboardHero'
import { useState, useEffect, useTransition } from 'react'
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
  CheckSquare,
  Square,
  Trash2,
  Archive,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  TYPE_LABEL,
  TYPE_LABEL_SINGULAR,
  bucketByStatus,
  type WalletItemType,
  type WalletItemWithStatus,
} from '../../_lib/wallet-utils'
import {
  bulkArchiveWalletItemsAction,
  bulkDeleteWalletItemsAction,
} from '../../_lib/wallet-actions'
import ConfirmModal from '@/app/_components/ConfirmModal'
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

  // v27.9.10 item 1 — bulk select. Mirrors the v27.9.4 trip
  // bulk-delete pattern. Selection is ACTIVE-TAB scoped (you can
  // only have selections from the tab you're viewing) — switching
  // tabs clears the set so cross-tab selection doesn't leak.
  // showGrid forces in WalletStatusSection when selectionMode is
  // on so the deck doesn't hide cards behind peeks.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmMode, setConfirmMode] = useState<null | 'archive' | 'delete'>(null)
  const [bulkPending, startBulkTransition] = useTransition()
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkFlash, setBulkFlash] = useState<string | null>(null)
  useEffect(() => {
    // Switching tabs while in selection mode would leave dangling
    // selections from a tab that's no longer rendered. Clear on
    // switch and exit selection mode together.
    setSelected(new Set())
    setSelectionMode(false)
    setBulkError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function exitSelection() {
    setSelectionMode(false)
    setSelected(new Set())
    setBulkError(null)
  }
  function runBulk(mode: 'archive' | 'delete') {
    setBulkError(null)
    const ids = Array.from(selected)
    startBulkTransition(async () => {
      const action = mode === 'archive' ? bulkArchiveWalletItemsAction : bulkDeleteWalletItemsAction
      const r = await action(ids)
      if ('error' in r) {
        setBulkError(r.error)
        return
      }
      const ok = r.processed
      const failed = r.failedIds.length
      const verb = mode === 'archive' ? 'Archived' : 'Deleted'
      setConfirmMode(null)
      exitSelection()
      setBulkFlash(
        failed === 0
          ? `${verb} ${ok} ${ok === 1 ? 'item' : 'items'}.`
          : `${verb} ${ok} of ${ids.length}. ${failed} failed.`,
      )
      setTimeout(() => setBulkFlash(null), 3500)
      router.refresh()
    })
  }
  const selectionActive = selectionMode

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

      {/* v27.3.6: Add wallet item CTA moved INTO the banner, below
          subtitle. Standalone instance removed; WalletHero now hosts
          it via the .bb-dash-hero-below-sub slot. */}

      {/* v27.3.3: divider after top CTA. */}
      <div className="bb-page-divider mt-4" aria-hidden="true" />

      {/* v27.6.3.3 item 3 — type filter chips. Was big paper-card
          buttons with 1.6rem count + label (.bb-wallet-stat-card)
          which Flavio called "large card" + "big and wide". Now a
          .bb-chip-row of compact pill chips matching /app/trips
          status filters. Active state = copper background (matches
          .bb-chip.is-active). Counts render inline next to the
          label. The bb-wallet-stats CSS classes are now orphaned
          but harmless; cleanup deferred. */}
      <div className="bb-chip-row mt-3" role="tablist" aria-label="Wallet category">
        {[...tabs, ...(moreOpen ? secondaryTabs : [])].map((t) => {
          const isActive = activeTab === t
          const TypeIcon = TAB_ICONS[t]
          return (
            <button
              key={`tab-${t}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t)}
              className={`bb-chip ${isActive ? 'is-active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <TypeIcon size={12} strokeWidth={2.2} aria-hidden="true" />
              {TYPE_LABEL[t]}
              <span style={{ opacity: 0.65, marginLeft: 4, fontWeight: 500 }}>
                ({countFor(t)})
              </span>
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

      {/* v27.9.10 item 1 — bulk select toolbar. Above the status
          sections so the affordance lives in a predictable place
          mirroring /app/trips. Flash success copy lives here too;
          the sticky bulk-action bar replaces it once one or more
          cards are selected. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          marginTop: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        {bulkFlash && (
          <span
            role="status"
            className="bb-form-help"
            style={{
              margin: 0,
              padding: '0.3rem 0.6rem',
              borderRadius: 6,
              background: 'rgba(176, 108, 60, 0.12)',
              color: 'var(--color-copper)',
              fontWeight: 600,
            }}
          >
            {bulkFlash}
          </span>
        )}
        {!selectionActive ? (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setSelectionMode(true)}
            disabled={items.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <CheckSquare size={14} aria-hidden="true" />
            Select
          </button>
        ) : (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={exitSelection}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <X size={14} aria-hidden="true" />
            Done
          </button>
        )}
      </div>

      {/* Sticky bulk action bar — visible only when at least one
          card is checked. Mirrors the /app/trips v27.9.4 pattern. */}
      {selectionActive && selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: '0.5rem',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.6rem 0.85rem',
            marginTop: '0.6rem',
            borderRadius: 10,
            background: 'var(--color-page-bg, #0B0806)',
            color: '#F4EFE5',
            boxShadow: '0 6px 20px -8px rgba(0, 0, 0, 0.45)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-barlow-condensed)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.85rem',
            }}
          >
            {selected.size} {selected.size === 1 ? 'card' : 'cards'} selected
          </span>
          <div style={{ display: 'inline-flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setBulkError(null)
                setConfirmMode('archive')
              }}
              disabled={bulkPending}
              className="bb-btn-secondary"
              style={{
                background: 'transparent',
                borderColor: 'rgba(255,255,255,0.35)',
                color: '#F4EFE5',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Archive size={14} aria-hidden="true" />
              Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkError(null)
                setConfirmMode('delete')
              }}
              disabled={bulkPending}
              className="bb-cta-sm bb-cta-sm-destructive"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
            <button
              type="button"
              onClick={exitSelection}
              disabled={bulkPending}
              className="bb-btn-secondary"
              style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.35)', color: '#F4EFE5' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bulkError && !confirmMode && (
        <p role="alert" style={{ color: '#8C3C2A', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          {bulkError}
        </p>
      )}

      {/* v27.6.3.3 item 3 — Active + Expired now sit side-by-side at
          desktop via .bb-wallet-status-grid. On tag tab the Done
          bucket (tagged_out) renders inline above the grid since
          it's tag-specific and readers expect it next to Active.
          Mobile keeps single-col stack. */}
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
          selectionMode={selectionActive}
          selectedIds={selected}
          onToggleSelect={toggleSelected}
        />
      )}

      <div className="bb-wallet-status-grid">
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
          selectionMode={selectionActive}
          selectedIds={selected}
          onToggleSelect={toggleSelected}
        />

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
          selectionMode={selectionActive}
          selectedIds={selected}
          onToggleSelect={toggleSelected}
        />
      </div>

      {/* Archived — small text link to view archived (deferred full surface) */}
      {buckets.archived.length > 0 && (
        <p className="mt-4" style={{ textAlign: 'center' }}>
          <span className="bb-form-help">
            {buckets.archived.length} archived item{buckets.archived.length === 1 ? '' : 's'}
          </span>
        </p>
      )}

      {/* v27.9.10 item 1 — confirm modals. Type-to-confirm "delete"
          mirrors /app/trips v27.9.4. Archive uses a softer prompt
          (reversible) without typeToConfirm. */}
      <ConfirmModal
        open={confirmMode === 'archive'}
        title={`Archive ${selected.size} ${selected.size === 1 ? 'card' : 'cards'}?`}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p>
              Archived cards move out of your active wallet but stay
              recoverable from the archive view. Trip-linked cards keep
              their links intact.
            </p>
            {bulkError && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">
                {bulkError}
              </p>
            )}
          </div>
        }
        confirmLabel={bulkPending ? 'Archiving…' : 'Archive'}
        cancelLabel="Cancel"
        onConfirm={() => runBulk('archive')}
        onCancel={() => {
          if (!bulkPending) setConfirmMode(null)
        }}
        isPending={bulkPending}
      />
      <ConfirmModal
        open={confirmMode === 'delete'}
        title={`Delete ${selected.size} ${selected.size === 1 ? 'card' : 'cards'} permanently?`}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p>
              This permanently removes the selected cards. Active cards
              get archived first, then deleted in the same pass — but a
              card linked to a harvest or trip may fail to delete.{' '}
              <strong>This cannot be undone.</strong>
            </p>
            {bulkError && (
              <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">
                {bulkError}
              </p>
            )}
          </div>
        }
        confirmLabel={bulkPending ? 'Deleting…' : 'Delete forever'}
        cancelLabel="Cancel"
        destructive
        typeToConfirm="delete"
        onConfirm={() => runBulk('delete')}
        onCancel={() => {
          if (!bulkPending) setConfirmMode(null)
        }}
        isPending={bulkPending}
      />
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
  // v27.5.0.4.3 — refactored to use DashboardHero. Was a custom
  // section with its own bb-wallet-hero-* CSS that included a LIGHT
  // cream-color gradient overlay (rgba 250/247/242, fading toward
  // transparent on the right). Against the new wildlife banner
  // image, that overlay produced a "weird fade" effect because the
  // cream wash bleached out the image's left side. Other banners
  // (dashboard / trips / hunters / docs) all use DashboardHero with
  // a DARK ink-color overlay for legibility against light text — so
  // the wallet banner now matches them. Single source of truth for
  // all banner styling. The bb-wallet-hero-* CSS classes are now
  // orphaned but harmless; cleanup deferred.
  return (
    <DashboardHero
      eyebrow="Your wallet"
      title="Wallet"
      subtitle="Licenses, tags, and credentials in one place."
      bgImage="/banners/wallet-hero.png"
      eyebrowColor="copper"
      showShield={false}
      objectPosition="top"
      rightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${basePath}/new?type=${activeTab}`}
            className="bb-cta-sm"
            aria-label="Add new card"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} aria-hidden="true" />
            Add new card
          </Link>
        </div>
      }
    />
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
  selectionMode = false,
  selectedIds,
  onToggleSelect,
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
  /** v27.9.10 item 1: bulk-select state passed through from WalletPage.
   *  When selectionMode is true the section forces the grid render
   *  (deck would hide cards behind peeks) and wraps each card with
   *  an absolute-button overlay that captures clicks for toggle. */
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
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
  // v27.9.10 item 1: force grid in selection mode so the deck doesn't
  // bury cards behind the peek stack — a hidden card can't be selected.
  const showGrid = expanded || isDesktop || selectionMode

  return (
    <section className="bb-wallet-section mt-4">
      <div className="bb-wallet-section-head">
        <span className="bb-wallet-section-title">
          {title} ({count})
        </span>
        {items.length > 1 && !isDesktop && !selectionMode && (
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
          {items.map((item) => {
            const card = (
              <WalletHeroCard
                key={item.id}
                item={item}
                basePath={basePath}
                eyebrow={TYPE_EYEBROW[type]}
                holderName={holderName}
              />
            )
            if (!selectionMode || !onToggleSelect) return card
            const checked = selectedIds?.has(item.id) ?? false
            // v27.9.10 item 1 — absolute-button overlay pattern from
            // BulkSelectableTripsList (v27.9.4.1). Single button covers
            // the whole card area at z=4 so clicks toggle without
            // navigating to the card's edit Link. Visible check
            // indicator at top-left has pointer-events:none so it
            // never intercepts.
            return (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  outline: checked ? '2px solid var(--color-copper)' : '2px solid transparent',
                  outlineOffset: 2,
                  transition: 'outline-color 120ms ease',
                }}
              >
                <button
                  type="button"
                  onClick={() => onToggleSelect(item.id)}
                  aria-pressed={checked}
                  aria-label={checked ? 'Deselect card' : 'Select card'}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 4,
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    borderRadius: 12,
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    zIndex: 5,
                    background: '#FFFFFF',
                    borderRadius: 6,
                    padding: 2,
                    display: 'inline-flex',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                    pointerEvents: 'none',
                  }}
                >
                  {checked ? (
                    <CheckSquare size={20} style={{ color: 'var(--color-copper)' }} />
                  ) : (
                    <Square size={20} style={{ color: 'var(--color-ink-muted)' }} />
                  )}
                </span>
                {card}
              </div>
            )
          })}
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

