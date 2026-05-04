import Image from 'next/image'
import type { ReactNode } from 'react'

// v27.0a.13: shared dark-bg hero used on /app, /app/h, /app/hunters,
// /app/h/guides, /app/trips, /app/h/trips. The bg image is variable per
// page (dashboard / network / trips). Eyebrow color is variable too —
// dashboard keeps it light cream; network + trips pages use copper per
// Flavio's brand-palette rule. Logo shield only renders on the dashboard
// variant where it's contextual; suppressed on other pages.
//
// v27.3.3.2: optional rightSlot replaces the shield position with a
// custom desktop-only element (e.g. inline invite form on /app/hunters).
// Mobile (<1024px) suppresses the slot via CSS so the title stays the
// banner focus.
export default function DashboardHero({
  eyebrow,
  title,
  subtitle,
  bgImage = '/bb-dashboard-hero.png',
  eyebrowColor = 'light',
  showShield = true,
  objectPosition,
  rightSlot,
}: {
  eyebrow: string
  title: string
  subtitle: string
  bgImage?: string
  eyebrowColor?: 'light' | 'copper'
  showShield?: boolean
  /**
   * CSS object-position override for the bg image. v27.0a.16 — network +
   * trips heroes need a non-center anchor so the figure's head stays in
   * frame at wider desktop viewports. Defaults to "center" (dashboard
   * behavior).
   */
  objectPosition?: string
  /** Desktop-only right slot. Hidden on mobile via .bb-dash-hero-right-slot. */
  rightSlot?: ReactNode
}) {
  const eyebrowClass =
    eyebrowColor === 'copper'
      ? 'bb-dash-hero-eyebrow bb-dash-hero-eyebrow-copper'
      : 'bb-dash-hero-eyebrow'

  return (
    <section className="bb-dash-hero">
      <Image
        src={bgImage}
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 64rem"
        className="bb-dash-hero-img"
        style={objectPosition ? { objectPosition } : undefined}
      />
      <div className="bb-dash-hero-overlay" />
      <div className="bb-dash-hero-inner">
        <div className="bb-dash-hero-text">
          <p className={eyebrowClass}>{eyebrow}</p>
          <h1 className="bb-dash-hero-title">{title}</h1>
          <p className="bb-dash-hero-sub">{subtitle}</p>
          {/* v27.3.4.1: rightSlot moved here — under the subtitle —
              per Flavio. Was hidden on the right via
              .bb-dash-hero-right-slot; now sits inline with the
              banner's text column on both mobile and desktop. */}
          {rightSlot ? (
            <div className="bb-dash-hero-below-sub">{rightSlot}</div>
          ) : null}
        </div>
        {!rightSlot && showShield ? (
          <Image
            src="/bb-shield.png"
            alt=""
            width={96}
            height={96}
            className="bb-dash-hero-shield"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </section>
  )
}
