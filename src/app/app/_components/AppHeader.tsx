import Image from 'next/image'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import AppNav from './AppNav'
import SignOutButton from './SignOutButton'
import MobileNavMenu from './MobileNavMenu'
import ConnectivityDot from '@/app/_components/ConnectivityDot'

// v26.1: overflow nav items moved into a hamburger drawer so the bottom-tab
// bar can hold 4 primary entries (Dashboard / Trips / Hunters / Reviews)
// while Documents / Settings / Support / Sign Out stay reachable on mobile.
// Desktop sidebar (>=1024px) still renders the full set; this header is
// hidden via .bb-app-mobile-header on desktop.
//
// v26.1.1: this list contains only serializable strings (no Icon component
// reference, no match function). React Server Components can't serialize
// function values across the boundary into a client component, which crashed
// /app with "Functions cannot be passed directly to Client Components". The
// drawer now accepts a string iconName and resolves the icon internally.
const GUIDE_DRAWER_ITEMS = [
  { href: '/app/docs',     label: 'Documents', iconName: 'fileText' as const },
  { href: '/app/settings', label: 'Settings',  iconName: 'settings' as const },
  { href: '/app/support',  label: 'Support',   iconName: 'lifebuoy' as const },
] as const

// Top bar shared across every /app screen. Active-state lives in the
// client-only <AppNav/> via usePathname(), which lets this component stay a
// Server Component so the rendered HTML is the same across reloads.
//
// v27.6.0.1 — `isAdmin` renders a small Mission Control link inline
// next to the brand mark on the mobile header (only visible <1024px
// since this component is hidden on desktop). Gives admins on
// mobile a one-tap entry into /admin without going through the
// drawer.
export default function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/app" aria-label="Bite Book home" className="flex items-center gap-2">
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

        <AppNav />

        {isAdmin ? (
          <Link href="/admin" className="bb-app-header-admin-pill" aria-label="Open Mission Control">
            <ShieldCheck size={12} aria-hidden="true" />
            <span>Admin</span>
          </Link>
        ) : null}

        {/* v27.7.0 — small online/offline dot. Sits between AppNav and
            the drawer hamburger so it's visible without competing for
            primary tap targets. Defaults online during SSR so the
            first paint isn't a misleading "offline" flash. */}
        <ConnectivityDot />

        <MobileNavMenu items={GUIDE_DRAWER_ITEMS}>
          <SignOutButton />
        </MobileNavMenu>
      </div>
    </header>
  )
}
