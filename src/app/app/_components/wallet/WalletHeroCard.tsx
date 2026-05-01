'use client'

import Link from 'next/link'
import type { CSSProperties, MouseEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import type { WalletItemType, WalletItemWithStatus, WalletDerivedStatus } from '../../_lib/wallet-utils'

// v27.0b.7: per type/status card skin. Replaces the v27.0a.20 single-skin
// system + the v27.0a.20 watermark stamp. Each skin has icons + labels
// baked into the artwork so the card only needs to render the dynamic
// values (identifier, state, valid_to, status pill).
//
// Mapping per spec:
//   license      → license active / license-expired
//   tag          → tag active / tag-tagged-out / tag-expired
//   permit       → tag active / tag-expired (shares tag skin)
//   harvest_report_card → tag active / tag-expired (shares tag skin)
//   guide_license → guide-license active / guide-license-expired
//   insurance, business_credential → fall back to legacy bb-card-skin.png
//     (no dedicated artwork yet; v27.1 candidate)
//
// Archived rows take the active skin since archived is a holding-pattern
// status and the user is reviewing them in the Archived section anyway.
function skinFor(type: WalletItemType, status: WalletDerivedStatus): string {
  if (type === 'license') {
    return status === 'expired'
      ? '/bb-card-skin-license-expired.png'
      : '/bb-card-skin-license.png'
  }
  if (type === 'tag') {
    if (status === 'used') return '/bb-card-skin-tag-tagged-out.png'
    if (status === 'expired') return '/bb-card-skin-tag-expired.png'
    return '/bb-card-skin-tag.png'
  }
  if (
    type === 'permit' ||
    type === 'harvest_report_card' ||
    // v27.0b.7.1: stamp shares the tag skin family per Flavio's spec.
    // Stamps don't have a tagged-out state; treat as active when not
    // expired. Dedicated stamp artwork is a v27.1 candidate.
    type === 'stamp'
  ) {
    return status === 'expired'
      ? '/bb-card-skin-tag-expired.png'
      : '/bb-card-skin-tag.png'
  }
  if (type === 'guide_license') {
    return status === 'expired'
      ? '/bb-card-skin-guide-license-expired.png'
      : '/bb-card-skin-guide-license.png'
  }
  // insurance, business_credential — keep legacy default until dedicated
  // artwork ships.
  return '/bb-card-skin.png'
}

// v27.0b.7.1: which types use the tag skin family. Drives the
// .bb-wallet-card--tag-family modifier class (extra left + top padding
// to clear the artwork's left-edge hole/grommet ornament).
function isTagFamily(type: WalletItemType): boolean {
  return (
    type === 'tag' ||
    type === 'permit' ||
    type === 'harvest_report_card' ||
    type === 'stamp'
  )
}

// Extracted from WalletPage in v27.0a.17 so the new WalletDeck component
// can render the same hero-card visual. Optional `style`, `className`,
// `onClick`, and `tabIndex` props let the deck animate transforms and
// intercept clicks (e.g. promote a fanned card to top before navigation).
export default function WalletHeroCard({
  item,
  basePath,
  eyebrow,
  style,
  className,
  onClick,
  tabIndex,
}: {
  item: WalletItemWithStatus
  basePath: string
  eyebrow: string
  style?: CSSProperties
  className?: string
  onClick?: (ev: MouseEvent<HTMLAnchorElement>) => void
  tabIndex?: number
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

  const isTaggedOut = item.status === 'used'

  const skin = skinFor(item.type, item.status)
  const isGuideLic = item.type === 'guide_license'
  const tagFamily = isTagFamily(item.type)

  // v27.0b.7: guide_license skins have the eyebrow ("Guide License")
  // baked into the artwork. Suppress the React-rendered eyebrow on that
  // type only so the title doesn't sit beneath a duplicate label.
  const showEyebrow = !isGuideLic

  // v27.0b.7.1: build the className list. .bb-wallet-card--tag-family
  // bumps left + top padding to clear the tag artwork's grommet/hole
  // ornament. .bb-wallet-card--guide-license switches to absolute-
  // positioned per-field layout so dynamic values land under the
  // baked-in labels (LICENSE HOLDER / STATE / LICENSE ID / VALID
  // THROUGH).
  const cls = [
    'bb-wallet-card',
    isTaggedOut ? 'bb-wallet-card--used' : '',
    tagFamily ? 'bb-wallet-card--tag-family' : '',
    isGuideLic ? 'bb-wallet-card--guide-license' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  if (isGuideLic) {
    // v27.0b.7.1: dedicated layout for guide_license. The skin has 4
    // baked-in labels stacked on the left side (LICENSE HOLDER / STATE
    // / LICENSE ID / VALID THROUGH) with copper icons. We render the
    // dynamic values as a 4-row grid pinned to the same vertical band
    // so each value sits next to its label. No eyebrow, no separate
    // top/bottom blocks — single grid keyed to artwork.
    const stateLabel = item.state ? expandStateLabel(item.state) : '—'
    const seasonLabel = item.season_year ? `${item.season_year}` : null
    return (
      <Link
        href={`${basePath}/${item.id}/edit`}
        className={cls}
        aria-label={`${eyebrow} ${item.identifier}`}
        style={{ ...style, backgroundImage: `url('${skin}')` }}
        onClick={onClick}
        tabIndex={tabIndex}
      >
        <div className="bb-wallet-card-gl-fields" aria-hidden={false}>
          <div className="bb-wallet-card-gl-row">
            {/* LICENSE HOLDER value. We don't have a dedicated holder
                column on wallet_items yet, so show the eyebrow ("Guide
                License") prop's already-known holder value via item
                fields available — currently we don't have it; surface
                identifier as a sensible fallback. v27.1 will plumb a
                real holder_name field through the form. */}
            <span className="bb-wallet-card-gl-value">{item.identifier || 'Untitled'}</span>
          </div>
          <div className="bb-wallet-card-gl-row">
            <span className="bb-wallet-card-gl-value">{stateLabel}</span>
          </div>
          <div className="bb-wallet-card-gl-row">
            <span className="bb-wallet-card-gl-value">
              {item.identifier || '—'}
              {seasonLabel ? <span className="bb-wallet-card-gl-meta"> · {seasonLabel}</span> : null}
            </span>
          </div>
          <div className="bb-wallet-card-gl-row">
            <span className="bb-wallet-card-gl-value">{validToFmt}</span>
          </div>
        </div>
        {/* Status pill remains in its standard bottom-right position so
            active / expired states stay legible at a glance. */}
        <div className="bb-wallet-card-gl-status">
          <span className={`bb-wallet-card-status bb-wallet-card-status-${item.status}`}>
            <CircleCheck size={12} aria-hidden="true" />
            {statusLabel}
          </span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`${basePath}/${item.id}/edit`}
      className={cls}
      aria-label={`${eyebrow} ${item.identifier}`}
      style={{ ...style, backgroundImage: `url('${skin}')` }}
      onClick={onClick}
      tabIndex={tabIndex}
    >
      {/* v27.0b.7: watermark stamp removed. The new per-type/status skins
          have icons baked into the artwork so the watermark stamp is
          redundant. Asset PNGs (bb-watermark-*.png) kept on disk in case
          we need them again. */}
      <div className="bb-wallet-card-top">
        {showEyebrow && <p className="bb-wallet-card-eyebrow">{eyebrow}</p>}
        <h3 className="bb-wallet-card-title">{item.identifier || 'Untitled'}</h3>
        {stateLine && <p className="bb-wallet-card-sub">{stateLine}</p>}
        {item.state && (
          <p className="bb-wallet-card-state">
            {expandStateLabel(item.state)}
          </p>
        )}
      </div>
      <div className="bb-wallet-card-bottom">
        {/* v27.0a.20: tagged-out skin has the ribbon baked in; suppress
            the redundant copper TAGGED OUT pill on used cards. Other
            statuses keep their pill so Active / Expired stay legible. */}
        {!isTaggedOut && (
          <span
            className={`bb-wallet-card-status bb-wallet-card-status-${item.status}`}
          >
            <CircleCheck size={12} aria-hidden="true" />
            {statusLabel}
          </span>
        )}
        {isTaggedOut && <span />}
        <div className="bb-wallet-card-validity">
          <p className="bb-wallet-card-validity-eyebrow">Valid through</p>
          <p className="bb-wallet-card-validity-date">{validToFmt}</p>
        </div>
      </div>
    </Link>
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
