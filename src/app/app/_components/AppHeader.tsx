import Image from 'next/image'
import Link from 'next/link'
import AppNav from './AppNav'
import SignOutButton from './SignOutButton'

// Top bar shared across every /app screen. Active-state lives in the
// client-only <AppNav/> via usePathname(), which lets this component stay a
// Server Component so the rendered HTML is the same across reloads.
export default function AppHeader() {
  return (
    <header className="bb-app-header">
      <div className="bb-app-header-inner">
        <Link href="/app" aria-label="Bite Book home" className="flex items-center gap-2">
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

        <AppNav />

        <SignOutButton />
      </div>
    </header>
  )
}
