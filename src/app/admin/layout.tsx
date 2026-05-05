import { requireAdmin } from '../app/_lib/auth'
import AdminSidebar from './_components/AdminSidebar'
import AdminMobileHeader from './_components/AdminMobileHeader'
import AdminMobileNav from './_components/AdminMobileNav'

// v27.6.0 — Mission Control shell. Pulls profile (admin-gated) and
// renders the admin sidebar + page slot. Mirrors /app/layout's
// bb-app-shell pattern so spacing/typography match the rest of the
// app, but the nav is the admin-only set rather than the guide nav.
//
// v27.6.0.1 — added AdminMobileNav (horizontal Accounts | Revenue
// strip) for <1024px since the desktop AdminSidebar is hidden on
// mobile. Without this, mobile admins land on Accounts with no path
// to Revenue.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()
  return (
    <div className="bb-app-bg bb-app-shell">
      <AdminSidebar />
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          <AdminMobileHeader />
        </div>
        <AdminMobileNav />
        {children}
      </div>
    </div>
  )
}
