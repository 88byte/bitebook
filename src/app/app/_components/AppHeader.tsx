import Image from 'next/image'
import Link from 'next/link'
import { FileText, Settings, LifeBuoy } from 'lucide-react'
import AppNav from './AppNav'
import SignOutButton from './SignOutButton'
import MobileNavMenu from './MobileNavMenu'

// v26.1: overflow nav items moved into a hamburger drawer so the bottom-tab
// bar can hold 4 primary entries (Dashboard / Trips / Hunters / Reviews)
// while Documents / Settings / Support / Sign Out stay reachable on mobile.
// Desktop sidebar (>=1024px) still renders the full set; this header is
// hidden via .bb-app-mobile-header on desktop.
const GUIDE_DRAWER_ITEMS = [
  { href: '/app/docs',     label: 'Documents', Icon: FileText, match: (p: string) => p.startsWith('/app/docs') },
  { href: '/app/settings', label: 'Settings',  Icon: Settings, match: (p: string) => p.startsWith('/app/settings') },
  { href: '/app/support',  label: 'Support',   Icon: LifeBuoy, match: (p: string) => p.startsWith('/app/support') },
] as const

// Top bar shared across every /app screen. Active-state lives in the
// client-only <AppNav/> via usePathname(), which lets this component stay a
// Server Component so the rendered HTML is the same across reloads.
export default function AppHeader() {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/app" aria-label="Bite Book home" className="flex items-center gap-2">
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

        <AppNav />

        <MobileNavMenu items={GUIDE_DRAWER_ITEMS}>
          <SignOutButton />
        </MobileNavMenu>
      </div>
    </header>
  )
}
