import AppHeader from './_components/AppHeader'
import Sidebar from './_components/Sidebar'

// Shared shell for /app/* routes. Auth/role enforcement runs per-page via
// requireGuide() so unauthenticated requests are redirected by middleware
// (proxy.ts) before this layout ever renders.
//
// v24: introduces a desktop sidebar at >=1024px. Below that breakpoint the
// sidebar is hidden and AppHeader (top bar) keeps working unchanged.
// On desktop the sidebar replaces AppHeader visually — AppHeader is hidden
// via .bb-app-mobile-header to avoid duplicating brand + nav on wide screens.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bb-app-bg bb-app-shell">
      <Sidebar />
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          <AppHeader />
        </div>
        {children}
      </div>
    </div>
  )
}
