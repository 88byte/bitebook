import Image from 'next/image'
import Link from 'next/link'
import HunterAppNav from './HunterAppNav'
import SignOutButton from './SignOutButton'

// v25.1: hunter-side mobile top bar. Same structure as AppHeader but the
// brand routes to /app/h and we render HunterAppNav. Server component so
// the rendered HTML is stable across navigations; active-state is handled
// inside HunterAppNav via usePathname().
export default function HunterAppHeader() {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/app/h" aria-label="Bite Book home" className="flex items-center gap-2">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="32px"
            className="h-8 w-8"
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

        <SignOutButton />
      </div>
    </header>
  )
}
