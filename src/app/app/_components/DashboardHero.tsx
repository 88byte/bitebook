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
  // v27.6.3 — default updated from /bb-dashboard-hero.png (root-path
  // legacy) to /banners/dashboard-hero.png (the v27.5.0.4.x banner set).
  // Belt-and-suspenders so any caller without an explicit bgImage gets
  // the new image instead of a 404 on the legacy path.
  bgImage = '/banners/dashboard-hero.png',
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
        // v27.6.3.3 item 6 — sizes was capped at 64rem (1024px) which
        // told Next.js to fetch a low-res srcset entry even on 1920+
        // displays where bb-app-main expands to 1480/1800/2000/2200
        // (v27.5.0.4). At those widths the picked srcset stretched
        // from ~1024px to ~2000px, producing the "banner images look
        // stretched out" effect Flavio reported. Match the actual
        // bb-app-main caps so the right srcset entry is used.
        sizes="(min-width: 160rem) 2200px, (min-width: 120rem) 2000px, (min-width: 96rem) 1800px, (min-width: 80rem) 1320px, (min-width: 64rem) 1180px, 100vw"
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
