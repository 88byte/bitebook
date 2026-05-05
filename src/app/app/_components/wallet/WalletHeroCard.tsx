'use client'

import Link from 'next/link'
import type { CSSProperties, MouseEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { normalizeWeaponRestriction } from '@/lib/methods'
import { WALLET_STATUS_LABEL } from '@/lib/labels'
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
  holderName,
  style,
  className,
  onClick,
  tabIndex,
}: {
  item: WalletItemWithStatus
  basePath: string
  eyebrow: string
  /** v27.0b.7.2: rendered in the LICENSE HOLDER slot on guide_license
   * cards. Comes from profiles.display_name of the wallet item's owner.
   * Null falls back to email-local-part — and ultimately a "—" if even
   * that's missing. Plumbed from WalletPage at the route layer. */
  holderName?: string | null
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
  // v27.1.5.3: status label sourced from the central labels.ts map so
  // the same word ("Done", "Active", etc.) surfaces here, on the
  // wallet section heading, and on trip pills. 'used' renders as "Done"
  // — a tagged-out tag is finished business, same vocab as a completed
  // trip.
  const statusLabel = WALLET_STATUS_LABEL[item.status]

  const isTaggedOut = item.status === 'used'

  const skin = skinFor(item.type, item.status)
  const isGuideLic = item.type === 'guide_license'
  const tagFamily = isTagFamily(item.type)
  // v27.6.3.5 item 4 — license-only modifier so the title (license
  // number) + state line nudge down and right to land on the
  // license skin's intended ID/state band. Other types unaffected.
  const isLicense = item.type === 'license'

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
    isLicense ? 'bb-wallet-card--license' : '',
    isGuideLic ? 'bb-wallet-card--guide-license' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  if (isGuideLic) {
    // v27.0b.7.2: dedicated guide_license layout. Each row absolutely
    // positioned at the artwork's exact label vertical band via
    // data-slot attribute (CSS pins each slot to a measured top%).
    // Slot mapping (corrected from v27.0b.7.1):
    //   holder → display_name (holderName prop, falls through email
    //            local-part, then a — placeholder)
    //   state  → expanded state name (e.g. "CALIFORNIA")
    //   id     → identifier (license number)
    //   valid  → valid_to formatted as "MMM d, yyyy"
    const stateLabel = item.state ? expandStateLabel(item.state) : '—'
    const holder = (holderName ?? '').trim() || '—'
    return (
      <Link
        href={`${basePath}/${item.id}/edit`}
        className={cls}
        aria-label={`${eyebrow} ${item.identifier}`}
        style={{ ...style, backgroundImage: `url('${skin}')` }}
        onClick={onClick}
        tabIndex={tabIndex}
      >
        <div className="bb-wallet-card-gl-row" data-slot="holder">
          <span className="bb-wallet-card-gl-value">{holder}</span>
        </div>
        <div className="bb-wallet-card-gl-row" data-slot="state">
          <span className="bb-wallet-card-gl-value">{stateLabel}</span>
        </div>
        <div className="bb-wallet-card-gl-row" data-slot="id">
          <span className="bb-wallet-card-gl-value">{item.identifier || '—'}</span>
        </div>
        <div className="bb-wallet-card-gl-row" data-slot="valid">
          <span className="bb-wallet-card-gl-value">{validToFmt}</span>
        </div>
        {/* Status pill in its own absolutely-positioned slot, sits to
            the right of the bottom-most label. */}
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
        {/* v27.0b.7.2: species + weapon + tag designation block for the
            tag-family (tag, permit, harvest_report_card, stamp). Each
            field skips render when empty. extras is jsonb on the row;
            we read the keys we know (weapon_restriction, tag_type) and
            normalize weapon_restriction so legacy lowercase + Any are
            handled. */}
        {tagFamily && (() => {
          const extras = (item.extras ?? null) as { weapon_restriction?: string; tag_type?: string } | null
          const weapon = normalizeWeaponRestriction(extras?.weapon_restriction)
          const tagDesignation = (extras?.tag_type ?? '').trim() || null
          const species = (item.species ?? '').trim() || null
          if (!species && !weapon && !tagDesignation) return null
          return (
            <div className="bb-wallet-card-meta">
              {species && (
                <p className="bb-wallet-card-meta-line">
                  <span className="bb-wallet-card-meta-label">Species</span>
                  <span className="bb-wallet-card-meta-value">{species}</span>
                </p>
              )}
              {weapon && (
                <p className="bb-wallet-card-meta-line">
                  <span className="bb-wallet-card-meta-label">Weapon</span>
                  <span className="bb-wallet-card-meta-value">{weapon}</span>
                </p>
              )}
              {tagDesignation && (
                <p className="bb-wallet-card-meta-line">
                  <span className="bb-wallet-card-meta-label">Designation</span>
                  <span className="bb-wallet-card-meta-value">{tagDesignation}</span>
                </p>
              )}
            </div>
          )
        })()}
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
