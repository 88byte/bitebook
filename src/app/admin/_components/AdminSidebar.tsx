'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users2, BarChart3, Tag, FileStack, History, ArrowLeftCircle, UserCircle2 } from 'lucide-react'
import SignOutButton from '../../app/_components/SignOutButton'

// v27.6.0 / v27.6.1 — Mission Control sidebar. Mirrors
// /app/_components/Sidebar.tsx markup so .bb-sidebar styles apply
// unchanged. Nav set:
//   Live    → Guides, Hunters, Revenue
//   Stubs   → Discounts, Templates, Activity (route to coming-soon
//             pages so we don't 404 mid-build)
// "Back to app" returns Flavio to the guide-side dashboard without
// signing him out — handy when bouncing between admin and his own
// guide account during testing.
//
// v27.6.1 — "Accounts" renamed to "Guides" (the page already
// filtered to role='guide'; the "Accounts" label was misleading).
// Hunters promoted from stub to live with a parallel listing.
const NAV_LIVE = [
  { href: '/admin',         label: 'Guides',  icon: Users2,       match: (p: string) => p === '/admin' || p.startsWith('/admin/guides') },
  { href: '/admin/hunters', label: 'Hunters', icon: UserCircle2,  match: (p: string) => p.startsWith('/admin/hunters') },
  { href: '/admin/revenue', label: 'Revenue', icon: BarChart3,    match: (p: string) => p.startsWith('/admin/revenue') },
] as const

const NAV_STUBS = [
  { href: '/admin/discounts', label: 'Discounts', icon: Tag,        match: (p: string) => p.startsWith('/admin/discounts') },
  { href: '/admin/templates', label: 'Templates', icon: FileStack,  match: (p: string) => p.startsWith('/admin/templates') },
  { href: '/admin/activity',  label: 'Activity',  icon: History,    match: (p: string) => p.startsWith('/admin/activity') },
] as const

export default function AdminSidebar() {
  const pathname = usePathname() ?? ''
  return (
    <aside className="bb-sidebar" aria-label="Mission Control navigation">
      <Link href="/admin" className="bb-sidebar-brand" aria-label="Mission Control home">
        <Image
          src="/bb-logo-mark.png"
          alt=""
          width={1024}
          height={1024}
          sizes="32px"
          className="h-8 w-8"
          priority
        />
        <span className="bb-sidebar-brand-text">Mission Control</span>
      </Link>

      <nav className="bb-sidebar-nav">
        {NAV_LIVE.map(({ href, label, icon: Icon, match }) => {
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

        <div className="bb-admin-nav-divider" aria-hidden="true">Coming soon</div>

        {NAV_STUBS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={`bb-sidebar-link bb-admin-stub ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}

        <div className="bb-admin-nav-divider" aria-hidden="true" />
        <Link href="/app" className="bb-sidebar-link">
          <ArrowLeftCircle size={18} aria-hidden="true" />
          <span>Back to app</span>
        </Link>
      </nav>

      <div className="bb-sidebar-foot">
        <SignOutButton />
      </div>
    </aside>
  )
}
