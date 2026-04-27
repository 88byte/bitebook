import AppHeader from './_components/AppHeader'

// Shared shell for /app/* routes. Auth/role enforcement runs per-page via
// requireGuide() so unauthenticated requests are redirected by middleware
// (proxy.ts) before this layout ever renders.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bb-app-bg flex flex-col flex-1">
      <AppHeader />
      {children}
    </div>
  )
}
