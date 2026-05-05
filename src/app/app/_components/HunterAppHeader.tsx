import Image from 'next/image'
import Link from 'next/link'
import HunterAppNav from './HunterAppNav'
import SignOutButton from './SignOutButton'
import MobileNavMenu from './MobileNavMenu'
import ConnectivityDot from '@/app/_components/ConnectivityDot'

// v26.1: hunter-side mobile drawer. Smaller surface than the guide side —
// just Support + Sign Out — but the hamburger still lives here so the layout
// stays consistent across roles and a future Settings/Privacy entry can drop
// in without redesigning the header.
//
// v26.1.1: serializable iconName strings only (see AppHeader for context).
const HUNTER_DRAWER_ITEMS = [
  { href: '/app/h/support', label: 'Support', iconName: 'lifebuoy' as const },
] as const

// v25.1: hunter-side mobile top bar. Same structure as AppHeader but the
// brand routes to /app/h and we render HunterAppNav. Server component so
// the rendered HTML is stable across navigations; active-state is handled
// inside HunterAppNav via usePathname().
export default function HunterAppHeader() {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/app/h" aria-label="Bite Book home" className="flex items-center gap-2">
          {/* v25.9.1 → v26.1.2: bumped mobile logo again (h-10 → h-12). sm:+ keeps the original 32px treatment. */}
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
            className="text-xs font-bold uppercase tracking-[0.18em] hidden sm:inline"
            style={{ fontFamily: 'var(--font-barlow-condensed)', color: '#FFFFFF' }}
          >
            Bite Book
          </span>
        </Link>

        <HunterAppNav />

        {/* v27.7.0 — connectivity dot, mirrors guide AppHeader. */}
        <ConnectivityDot />

        <MobileNavMenu items={HUNTER_DRAWER_ITEMS}>
          <SignOutButton />
        </MobileNavMenu>
      </div>
    </header>
  )
}
