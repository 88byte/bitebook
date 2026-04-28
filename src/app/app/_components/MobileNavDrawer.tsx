'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, LifeBuoy, Settings, X, type LucideIcon } from 'lucide-react'

// v26.1: mobile-only right-slide drawer for nav overflow. Lives behind a
// hamburger trigger in AppHeader / HunterAppHeader. Holds the lower-frequency
// nav items that don't fit in the 4-up bottom tab bar (Documents, Settings,
// Support, Sign Out for the guide; Support, Sign Out for the hunter). Desktop
// sidebar shows everything natively, so this drawer never renders at >=1024px
// (the parent trigger button is hidden via .bb-hamburger media query).
//
// v26.1.1: tightened the server→client contract. The previous shape included
// `Icon: LucideIcon` and `match: (p) => boolean` — both function values — which
// React refuses to serialize across the Server→Client boundary, crashing /app
// with "Functions cannot be passed directly to Client Components". The drawer
// now accepts a string `iconName` and resolves the icon + active-match itself.
//
// Accessibility:
//   - role="dialog" aria-modal="true"
//   - ESC key closes
//   - Focus trap cycles within the panel while open
//   - Body scroll locked while open
//   - On close the parent (MobileNavMenu) returns focus to the hamburger
//     trigger button via its own ref.

const ICON_MAP: Record<string, LucideIcon> = {
  fileText: FileText,
  settings: Settings,
  lifebuoy: LifeBuoy,
}

export type DrawerIconName = keyof typeof ICON_MAP

export type MobileNavDrawerItem = {
  href: string
  label: string
  iconName: DrawerIconName
}

type Props = {
  isOpen: boolean
  onClose: () => void
  items: ReadonlyArray<MobileNavDrawerItem>
  children?: ReactNode
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  // Treat sub-routes as active too (e.g. /app/settings/foo while on Settings).
  return pathname.startsWith(`${href}/`)
}

export default function MobileNavDrawer({ isOpen, onClose, items, children }: Props) {
  const pathname = usePathname() ?? ''
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  // ESC + body scroll lock while open.
  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  // Focus trap — when open, focus the close button on mount and cycle Tab /
  // Shift+Tab within the focusable elements inside the panel.
  useEffect(() => {
    if (!isOpen) return
    const t = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return

      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first || !panel.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null

  const panel = (
    <>
      <div
        className={`bb-drawer-backdrop${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`bb-drawer-panel${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-drawer-title"
        aria-hidden={!isOpen}
        tabIndex={-1}
      >
        <div className="bb-drawer-head">
          <span id="bb-drawer-title" className="bb-drawer-title">
            Menu
          </span>
          <button
            type="button"
            ref={closeButtonRef}
            className="bb-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
            tabIndex={isOpen ? 0 : -1}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav className="bb-drawer-items" aria-label="More navigation">
          {items.map(({ href, label, iconName }) => {
            const Icon = ICON_MAP[iconName] ?? FileText
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={`bb-drawer-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
                tabIndex={isOpen ? 0 : -1}
              >
                <Icon size={20} aria-hidden="true" className="bb-drawer-icon" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {children ? <div className="bb-drawer-foot">{children}</div> : null}
      </div>
    </>
  )

  return createPortal(panel, document.body)
}
