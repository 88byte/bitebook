import Image from 'next/image'

// v27.0a.13: shared dark-bg hero used on /app, /app/h, /app/hunters,
// /app/h/guides, /app/trips, /app/h/trips. The bg image is variable per
// page (dashboard / network / trips). Eyebrow color is variable too —
// dashboard keeps it light cream; network + trips pages use copper per
// Flavio's brand-palette rule. Logo shield only renders on the dashboard
// variant where it's contextual; suppressed on other pages.
export default function DashboardHero({
  eyebrow,
  title,
  subtitle,
  bgImage = '/bb-dashboard-hero.png',
  eyebrowColor = 'light',
  showShield = true,
}: {
  eyebrow: string
  title: string
  subtitle: string
  bgImage?: string
  eyebrowColor?: 'light' | 'copper'
  showShield?: boolean
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
      />
      <div className="bb-dash-hero-overlay" />
      <div className="bb-dash-hero-inner">
        <div className="bb-dash-hero-text">
          <p className={eyebrowClass}>{eyebrow}</p>
          <h1 className="bb-dash-hero-title">{title}</h1>
          <p className="bb-dash-hero-sub">{subtitle}</p>
        </div>
        {showShield && (
          <Image
            src="/bb-shield.png"
            alt=""
            width={96}
            height={96}
            className="bb-dash-hero-shield"
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  )
}
