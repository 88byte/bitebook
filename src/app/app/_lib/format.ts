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

// v25.9.1: render a trip's location from the structured city/state/zone
// columns when set, with a graceful fallback to the legacy free-text
// location_name. Examples:
//   { city: 'Mendocino', state: 'CA', zone: 'D6' }     → "Mendocino, CA · D6"
//   { city: null, state: 'CA', zone: 'D6' }            → "CA · D6"
//   legacy { location_name: 'Big Sur D7', state: '' }  → "Big Sur D7"
//   nothing set                                        → null
export function formatTripLocation(t: {
  city?: string | null
  state?: string | null
  zone?: string | null
  county?: string | null
  location_name?: string | null
}): string | null {
  const city = t.city?.trim() || ''
  const state = t.state?.trim() || ''
  const zone = t.zone?.trim() || ''

  if (city || state || zone) {
    let head = ''
    if (city && state) head = `${city}, ${state}`
    else if (city) head = city
    else if (state) head = state
    return zone ? (head ? `${head} · ${zone}` : zone) : (head || null)
  }

  const legacy = t.location_name?.trim()
  return legacy || null
}
