// v27.0a.12: shared mountains+pine silhouette SVG. Used as a decorative
// watermark on person cards (hunters/guides pages) and elsewhere. Inherits
// `currentColor` so callers can tint via the parent's color.
export default function MountainsArt({
  width = 140,
  height = 56,
  className,
}: {
  width?: number
  height?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 140 56"
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="xMidYMax meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* back ridge */}
      <path
        d="M0 50 L24 16 L46 36 L70 12 L94 32 L118 20 L140 42 L140 56 L0 56 Z"
        fill="currentColor"
        opacity="0.55"
      />
      {/* front ridge */}
      <path
        d="M0 56 L14 36 L34 50 L56 32 L80 50 L102 40 L126 56 L140 50 L140 56 Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* tall right pine */}
      <path
        d="M118 56 L121 38 L116 41 L122 30 L116 33 L122 22 L128 33 L122 30 L128 41 L122 38 L125 56 Z"
        fill="currentColor"
        opacity="0.95"
      />
      {/* small middle pine */}
      <path
        d="M86 56 L88 44 L84 46 L88 38 L84 40 L88 32 L92 40 L88 38 L92 46 L88 44 L90 56 Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  )
}
