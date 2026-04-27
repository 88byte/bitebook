'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, FileText, Settings } from 'lucide-react'
import SignOutButton from './SignOutButton'

// Desktop-only sidebar. Hidden under 1024px via .bb-sidebar CSS. Uses
// usePathname for active state so this is a client component.
const NAV = [
  { href: '/app',          label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/trips',    label: 'Trips',     icon: Calendar,        match: (p: string) => p.startsWith('/app/trips') },
  { href: '/app/hunters',  label: 'Hunters',   icon: Users,           match: (p: string) => p.startsWith('/app/hunters') },
  { href: '/app/docs',     label: 'Documents', icon: FileText,        match: (p: string) => p.startsWith('/app/docs') },
  { href: '/app/settings', label: 'Settings',  icon: Settings,        match: (p: string) => p.startsWith('/app/settings') },
] as const

export default function Sidebar() {
  const pathname = usePathname() ?? ''
  return (
    <aside className="bb-sidebar" aria-label="Primary navigation">
      <Link href="/app" className="bb-sidebar-brand" aria-label="Bite Book home">
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
        <SignOutButton />
      </div>
    </aside>
  )
}
