import Image from 'next/image'
import Link from 'next/link'

// v27.6.0 — Minimal mobile header for the admin shell. The desktop
// sidebar handles all navigation at >=1024px; on mobile we render
// just a brand line + Back-to-app link so the admin can bail out to
// the guide dashboard without scrolling. Sub-pages render their own
// nav (chip filters, breadcrumbs) inside the page body.
export default function AdminMobileHeader() {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/admin" aria-label="Mission Control home" className="flex items-center gap-2">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="48px"
            className="h-12 w-12 sm:h-8 sm:w-8"
            priority
          />
          <span
            className="text-xs font-bold uppercase tracking-[0.18em]"
            style={{ fontFamily: 'var(--font-barlow-condensed)', color: '#FFFFFF' }}
          >
            Mission Control
          </span>
        </Link>
        <Link
          href="/app"
          style={{
            color: '#FFFFFF',
            fontSize: '0.85rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← App
        </Link>
      </div>
    </header>
  )
}
