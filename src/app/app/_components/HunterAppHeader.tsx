import Image from 'next/image'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import HunterAppNav from './HunterAppNav'
import SignOutButton from './SignOutButton'
import MobileNavMenu from './MobileNavMenu'

// v26.1: hunter-side mobile drawer. Smaller surface than the guide side —
// just Support + Sign Out — but the hamburger still lives here so the layout
// stays consistent across roles and a future Settings/Privacy entry can drop
// in without redesigning the header.
const HUNTER_DRAWER_ITEMS = [
  { href: '/app/h/support', label: 'Support', Icon: LifeBuoy, match: (p: string) => p.startsWith('/app/h/support') },
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
          {/* v25.9.1: bumped mobile logo (~25%) — sm:+ keeps the original 32px treatment. */}
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="40px"
            className="h-10 w-10 sm:h-8 sm:w-8"
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

        <MobileNavMenu items={HUNTER_DRAWER_ITEMS}>
          <SignOutButton />
        </MobileNavMenu>
      </div>
    </header>
  )
}
