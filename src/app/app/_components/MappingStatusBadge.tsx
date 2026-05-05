// v27.3.10.5 item 2 — shared mapping-status badge.
//
// Used in two places:
//   1. /app/docs library cards (DocsLibraryList.tsx replaces its
//      inline MappingBadge with this component).
//   2. /app/docs/[id] doc detail page next to the "Field mapping"
//      heading.
//
// Three colored variants matching the color tokens used throughout
// the wizard's per-row status pills:
//   - mapped   → forest green (#2F5A2A on rgba(63,107,58,0.14)) — same
//                tokens as the wizard's bb-status-pill-mapped.
//   - partial  → copper/amber (var(--color-copper) on rgba(168,92,50,0.16))
//                — same as bb-status-pill-needs-review.
//   - unmapped → red (#A33D3D on rgba(163,61,61,0.14)). New token,
//                drawn from the destructive button family used on
//                .bb-cta-sm-destructive (#B33A2E neighborhood).
//
// archived takes precedence over status (renders the gray Archived
// pill). status='not_applicable' renders nothing — resource docs
// don't surface a mapping state at all.

export type MappingStatus = 'unmapped' | 'partial' | 'complete' | 'not_applicable' | string

export default function MappingStatusBadge({
  status,
  archived = false,
  size = 'md',
}: {
  status: MappingStatus
  archived?: boolean
  size?: 'sm' | 'md'
}) {
  const isSm = size === 'sm'
  const fontSize = isSm ? '0.7rem' : '0.75rem'
  const padding = isSm ? '0.18rem 0.45rem' : '0.2rem 0.5rem'

  if (archived) {
    return (
      <span
        style={{
          flexShrink: 0,
          fontSize,
          fontWeight: 700,
          padding,
          borderRadius: 999,
          background: 'var(--color-ink-tint, #BFB5A6)',
          color: 'var(--color-ink-soft)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        Archived
      </span>
    )
  }
  if (status === 'not_applicable') return null

  if (status === 'complete') {
    return (
      <span
        style={{
          flexShrink: 0,
          fontSize,
          fontWeight: 700,
          padding,
          borderRadius: 999,
          background: 'rgba(63, 107, 58, 0.14)',
          color: '#2F5A2A',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        Mapped
      </span>
    )
  }

  if (status === 'partial') {
    return (
      <span
        style={{
          flexShrink: 0,
          fontSize,
          fontWeight: 700,
          padding,
          borderRadius: 999,
          background: 'rgba(168, 92, 50, 0.16)',
          color: 'var(--color-copper)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        Partial
      </span>
    )
  }

  // Default: unmapped (red).
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize,
        fontWeight: 700,
        padding,
        borderRadius: 999,
        background: 'rgba(163, 61, 61, 0.14)',
        color: '#A33D3D',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      Unmapped
    </span>
  )
}
