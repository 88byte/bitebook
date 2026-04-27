// Date helpers tuned for the trip-row layout. We render dates in the user's
// locale-default timezone — a guide in CA expects to see PT, not UTC. The DB
// stores ISO timestamps with TZ, so toLocale* DTRT.

export function tripMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
}

export function tripDay(iso: string): string {
  return String(new Date(iso).getDate())
}

export function tripDateRange(starts: string, ends: string | null): string {
  const s = new Date(starts)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const sStr = s.toLocaleDateString(undefined, opts)
  if (!ends) return sStr
  const e = new Date(ends)
  // Same day → just the start
  if (e.toDateString() === s.toDateString()) return sStr
  // Same month → "Apr 26-28"
  if (e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear()) {
    return `${sStr}–${e.getDate()}`
  }
  return `${sStr} – ${e.toLocaleDateString(undefined, opts)}`
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function relativeOrDate(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7 && diffDays > 0) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}
