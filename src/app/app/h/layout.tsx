// v25.2: shell rendering moved to /app/layout.tsx (which is role-aware via
// requireUser). This file used to render the hunter shell, but Next.js
// composes parent + nested layouts, so doing it here caused a double-nav
// bug (guide shell from parent + hunter shell from here). Keeping the
// route-group folder so /app/h/* still has its own routing namespace, but
// the layout itself is a pass-through.
export default function HunterAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
