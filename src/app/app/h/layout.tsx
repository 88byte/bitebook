import HunterAppHeader from '../_components/HunterAppHeader'
import HunterSidebar from '../_components/HunterSidebar'

// v25.1: hunter-side shell. Mirrors /app/layout.tsx but with hunter
// components. Auth/role enforcement runs per-page via requireHunter().
export default function HunterAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bb-app-bg bb-app-shell">
      <HunterSidebar />
      <div className="bb-app-content">
        <div className="bb-app-mobile-header">
          <HunterAppHeader />
        </div>
        {children}
      </div>
    </div>
  )
}
