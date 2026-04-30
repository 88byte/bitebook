'use client'

import { useRef, useState, useMemo, type CSSProperties, type MouseEvent } from 'react'
import WalletHeroCard from './WalletHeroCard'
import type { WalletItemType, WalletItemWithStatus } from '../../_lib/wallet-utils'

// v27.0a.17: stacked-deck pattern that replaces the per-section horizontal
// carousel. Top card visible, two peeks behind with progressive Y/X-offset
// + slight rotation for depth. Mobile: drag-flick the top card off to
// advance. Desktop: hover the deck → cards fan out horizontally; hovering
// a fanned card raises + outlines it; clicking a non-top fanned card
// promotes it to top and collapses the fan. All animations use only
// transform/opacity (no layout) for 60fps on iPhone 12+.
export default function WalletDeck({
  items,
  basePath,
  eyebrow,
  type,
  ariaLabel,
}: {
  items: WalletItemWithStatus[]
  basePath: string
  eyebrow: string
  type: WalletItemType
  ariaLabel: string
}) {
  const [topIndex, setTopIndex] = useState(0)
  const [isFanned, setIsFanned] = useState(false)
  const [dragX, setDragX] = useState(0)
  const dragStartX = useRef<number | null>(null)
  const exitingRef = useRef(false)

  // Cap visible peeks at 3 (top + 2 behind). Beyond that we render an
  // additional "+N more" tile at the back. With 5 or fewer items we don't
  // bother with the +N tile.
  const MAX_PEEKS = 3
  const FAN_SHOW = 5
  const showMoreTile = items.length > FAN_SHOW

  const total = items.length

  function relPos(absIdx: number): number {
    // 0 = top, 1 = first peek, etc. (mod total)
    return (absIdx - topIndex + total) % total
  }

  function advance(direction: 1 | -1) {
    setTopIndex((i) => (i + direction + total) % total)
  }

  function selectIndex(absIdx: number) {
    setTopIndex(absIdx)
    setIsFanned(false)
  }

  // ── Touch / mouse drag for mobile flick ──────────────────────────────
  function onPointerDown(clientX: number) {
    if (total <= 1) return
    if (isFanned) return // fan mode is desktop hover; don't drag
    dragStartX.current = clientX
    setDragX(0)
  }

  function onPointerMove(clientX: number) {
    if (dragStartX.current === null) return
    setDragX(clientX - dragStartX.current)
  }

  function onPointerEnd() {
    if (dragStartX.current === null) return
    const dist = dragX
    dragStartX.current = null
    if (Math.abs(dist) > 80) {
      // Animate off-screen, then advance
      exitingRef.current = true
      setDragX(dist > 0 ? 700 : -700)
      window.setTimeout(() => {
        exitingRef.current = false
        setDragX(0)
        advance(1)
      }, 220)
    } else {
      setDragX(0)
    }
  }

  // ── Keyboard nav when deck is focused ─────────────────────────────────
  function onKey(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault()
      advance(1)
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      advance(-1)
    }
  }

  // ── Card click handler — promote fanned card to top before navigating ─
  function onCardClick(absIdx: number) {
    return (ev: MouseEvent<HTMLAnchorElement>) => {
      if (isFanned && relPos(absIdx) !== 0) {
        ev.preventDefault()
        selectIndex(absIdx)
      }
    }
  }

  // ── Compute style per card per state ─────────────────────────────────
  const visibleIndices = useMemo(() => {
    // Render the top card + next MAX_PEEKS - 1 peeks. If we're fanned,
    // render up to FAN_SHOW cards.
    const cap = isFanned ? Math.min(total, FAN_SHOW) : Math.min(total, MAX_PEEKS)
    const out: number[] = []
    for (let i = 0; i < cap; i++) {
      out.push((topIndex + i) % total)
    }
    return out
  }, [topIndex, isFanned, total])

  function cardStyle(absIdx: number): CSSProperties {
    const pos = relPos(absIdx)

    if (isFanned) {
      // Fan layout: spread cards horizontally with slight arc.
      // Position 0 stays roughly centered; positions 1..N spread to the right.
      const fanCount = Math.min(total, FAN_SHOW)
      const spread = 36 // px per step
      const tx = pos * spread
      const ty = Math.abs(pos - (fanCount - 1) / 2) * 4 // mild arc up at edges
      const rot = (pos - (fanCount - 1) / 2) * 4 // -8°…+8°
      return {
        transform: `translate3d(${tx}px, ${-ty}px, 0) rotate(${rot}deg)`,
        zIndex: 100 - pos,
        opacity: pos < fanCount ? 1 : 0,
      }
    }

    // Idle stack: top card at 0, peeks behind get progressive offsets.
    if (pos === 0) {
      // Top card may also be drag-translated.
      const rotDuringDrag = dragX === 0 ? 0 : dragX / 30
      return {
        transform: `translate3d(${dragX}px, 0, 0) rotate(${rotDuringDrag}deg)`,
        zIndex: 100,
        opacity: 1,
        transition: exitingRef.current
          ? 'transform 220ms ease-out, opacity 220ms ease-out'
          : dragX === 0
            ? 'transform 200ms ease-out'
            : 'none',
      }
    }
    if (pos < MAX_PEEKS) {
      const ty = pos * 6
      const tx = pos * 2
      const rot = -1 * pos
      return {
        transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg)`,
        zIndex: 100 - pos,
        opacity: 1,
        filter: `brightness(${1 - pos * 0.04})`,
      }
    }
    return { opacity: 0, pointerEvents: 'none', zIndex: 0 }
  }

  if (total === 0) return null

  return (
    <div
      className={`bb-wallet-deck${isFanned ? ' is-fanned' : ''}`}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseEnter={() => total > 1 && setIsFanned(true)}
      onMouseLeave={() => setIsFanned(false)}
      onKeyDown={onKey}
      onTouchStart={(e) => onPointerDown(e.touches[0].clientX)}
      onTouchMove={(e) => onPointerMove(e.touches[0].clientX)}
      onTouchEnd={onPointerEnd}
    >
      {visibleIndices.map((absIdx) => (
        <div
          key={items[absIdx].id}
          className="bb-wallet-deck-slot"
          style={cardStyle(absIdx)}
          aria-hidden={relPos(absIdx) !== 0 && !isFanned}
        >
          <WalletHeroCard
            item={items[absIdx]}
            basePath={basePath}
            eyebrow={eyebrow}
            onClick={onCardClick(absIdx)}
            tabIndex={relPos(absIdx) === 0 || isFanned ? 0 : -1}
          />
        </div>
      ))}
      {showMoreTile && isFanned && (
        <div
          className="bb-wallet-deck-slot bb-wallet-deck-more"
          style={{
            transform: `translate3d(${FAN_SHOW * 36}px, 0, 0) rotate(${((FAN_SHOW - 1) / 2) * 4}deg)`,
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          <span className="bb-wallet-deck-more-num">+{total - FAN_SHOW}</span>
          <span className="bb-wallet-deck-more-label">more</span>
        </div>
      )}
      {/* Suppress text while we're using transforms. Keep the unused type
          binding referenced so the prop survives lints. */}
      <span hidden>{type}</span>
    </div>
  )
}
