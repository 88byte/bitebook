'use client'

import Link from 'next/link'
import type { CSSProperties, MouseEvent } from 'react'
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
  CircleCheck,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WalletItemType, WalletItemWithStatus } from '../../_lib/wallet-utils'

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

  const watermarkSrc = WATERMARK_IMG[item.type]
  const FallbackIcon = TAB_ICONS[item.type] ?? Crosshair

  const isTaggedOut = item.status === 'used'

  return (
    <Link
      href={`${basePath}/${item.id}/edit`}
      className={`bb-wallet-card${isTaggedOut ? ' bb-wallet-card--used' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`${eyebrow} ${item.identifier}`}
      style={style}
      onClick={onClick}
      tabIndex={tabIndex}
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
        <h3 className="bb-wallet-card-title">
          {isTaggedOut && (
            <Trophy
              size={18}
              aria-hidden="true"
              style={{
                display: 'inline-block',
                marginRight: '0.4rem',
                verticalAlign: '-2px',
                color: 'var(--color-copper)',
              }}
            />
          )}
          {item.identifier || 'Untitled'}
        </h3>
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
          {isTaggedOut ? (
            <Trophy size={12} aria-hidden="true" />
          ) : (
            <CircleCheck size={12} aria-hidden="true" />
          )}
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
