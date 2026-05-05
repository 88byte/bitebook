'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Wallet, Users, User, LifeBuoy } from 'lucide-react'
import SignOutButton from './SignOutButton'
import ConnectivityDot from '@/app/_components/ConnectivityDot'

// v25.1: hunter-side desktop sidebar. Same shell as Sidebar.tsx but a leaner nav.
// v27.0a: Wallet added between My trips and Guides.
const NAV = [
  { href: '/app/h',          label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/app/h' },
  { href: '/app/h/trips',    label: 'My trips',  icon: Calendar,        match: (p: string) => p.startsWith('/app/h/trips') },
  { href: '/app/h/wallet',   label: 'Wallet',    icon: Wallet,          match: (p: string) => p.startsWith('/app/h/wallet') },
  { href: '/app/h/guides',   label: 'Guides',    icon: Users,           match: (p: string) => p.startsWith('/app/h/guides') },
  { href: '/app/h/profile',  label: 'Profile',   icon: User,            match: (p: string) => p.startsWith('/app/h/profile') },
  { href: '/app/h/support',  label: 'Support',   icon: LifeBuoy,        match: (p: string) => p.startsWith('/app/h/support') },
] as const

export default function HunterSidebar() {
  const pathname = usePathname() ?? ''
  return (
    <aside className="bb-sidebar" aria-label="Primary navigation">
      <Link href="/app/h" className="bb-sidebar-brand" aria-label="Bite Book home">
        <Image
          src="/bb-logo-mark.png"
          alt=""
          width={1024}
          height={1024}
          sizes="32px"
          className="h-8 w-8"
          priority
        />
        <span className="bb-sidebar-brand-text">Bite Book</span>
      </Link>

      <nav className="bb-sidebar-nav">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={`bb-sidebar-link ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="bb-sidebar-foot">
        {/* v27.7.0 — connectivity status, mirrors guide Sidebar foot. */}
        <ConnectivityDot variant="labeled" />
        <SignOutButton />
      </div>
    </aside>
  )
}
