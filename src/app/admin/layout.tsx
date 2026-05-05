import { requireAdmin } from '../app/_lib/auth'
import AdminSidebar from './_components/AdminSidebar'
import AdminMobileHeader from './_components/AdminMobileHeader'

// v27.6.0 — Mission Control shell. Pulls profile (admin-gated) and
// renders the admin sidebar + page slot. Mirrors /app/layout's
// bb-app-shell pattern so spacing/typography match the rest of the
// app, but the nav is the admin-only set rather than the guide nav.
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
        {children}
      </div>
    </div>
  )
}
