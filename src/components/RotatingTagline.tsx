// Rotating tagline: one clause visible at a time, crossfade rotation.
// Pure CSS animation — each clause cycles through opacity 0 → 1 → 0 within a
// shared 12s loop, offset by index so they take turns. Container reserves the
// height of one line so the page doesn't reflow.
//
// Reduced motion: the @media block in globals.css collapses the grid to a
// stacked, statically-visible layout (still in the softer style).
const CLAUSES = [
  'Built For Organization.',
  'Keep Track of Hunts.',
  'Never Forget Another Tag.',
  'Stay Ready For The Warden.',
]

const CYCLE_SECONDS = 16 // 4 clauses × ~4s per clause (must match keyframe in globals.css)

export default function RotatingTagline() {
  return (
    <div
      className="bb-tagline relative z-10 w-full max-w-3xl"
      role="text"
      aria-label={CLAUSES.join(' ')}
    >
      {CLAUSES.map((clause, i) => (
        <span
          key={clause}
          className="bb-tagline-clause"
          style={{ animationDelay: `${(i * CYCLE_SECONDS) / CLAUSES.length}s` }}
          aria-hidden={i !== 0}
        >
          {clause}
        </span>
      ))}
    </div>
  )
}
