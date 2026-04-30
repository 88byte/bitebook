import Image from 'next/image'

// v27.0a.9: shared dashboard hero banner used on /app and /app/h.
// Dark forest bg image (bb-dashboard-hero.png) with an ink-fade gradient
// overlay so the white title + subtitle stay readable. Top-right shows a
// shield logo card (bb-shield.png) — purely decorative.
export default function DashboardHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <section className="bb-dash-hero">
      <Image
        src="/bb-dashboard-hero.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 64rem"
        className="bb-dash-hero-img"
      />
      <div className="bb-dash-hero-overlay" />
      <div className="bb-dash-hero-inner">
        <div className="bb-dash-hero-text">
          <p className="bb-dash-hero-eyebrow">{eyebrow}</p>
          <h1 className="bb-dash-hero-title">{title}</h1>
          <p className="bb-dash-hero-sub">{subtitle}</p>
        </div>
        <Image
          src="/bb-shield.png"
          alt=""
          width={96}
          height={96}
          className="bb-dash-hero-shield"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
