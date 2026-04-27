import { requireUser } from './_lib/auth'
import AppHeader from './_components/AppHeader'
import HunterAppHeader from './_components/HunterAppHeader'
import Sidebar from './_components/Sidebar'
import HunterSidebar from './_components/HunterSidebar'

// Shared shell for /app/* routes.
//
// v25.2: role-aware shell. Previously this layout always rendered the guide
// Sidebar + AppHeader, and /app/h/layout.tsx rendered an additional
// HunterSidebar + HunterAppHeader on top — Next.js composes parent + nested
// layouts, so hunters saw BOTH shells stacked. We now read the role here and
// pick the correct shell once. /app/h/layout.tsx is a pass-through.
//
// Auth gate at the page level still runs (each page calls
// requireGuide / requireHunter) which enforces the route's role and handles
// the loop-safe redirect targets. requireUser here just yields the profile
// so we know which shell to render; if the user is unauthed it redirects to
// /login?next=/app (the page-level gate then refines next on its own redirect
// chain if needed).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser()
  const isHunter = profile.role === 'hunter'

  return (
    <div className="bb-app-bg bb-app-shell">
      {isHunter ? <HunterSidebar /> : <Sidebar />}
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          {isHunter ? <HunterAppHeader /> : <AppHeader />}
        </div>
        {children}
      </div>
    </div>
  )
}
