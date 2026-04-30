// v27.0a.11: trip-card date column styled like a small physical calendar tab.
// Three layered parts:
//   1. dark forest-green top tab with the uppercase month
//   2. paper body with the big bold day
//   3. faded mountain + pine silhouette inline SVG at the bottom
// Decorative — wrapped aria-hidden. The card's own <Link> has the aria-label.
export default function TripDateBlock({
  month,
  day,
}: {
  month: string
  day: string
}) {
  return (
    <div className="bb-trip-cal" aria-hidden="true">
      <span className="bb-trip-cal-top">{month}</span>
      <span className="bb-trip-cal-day">{day}</span>
      <svg
        className="bb-trip-cal-mountains"
        viewBox="0 0 80 24"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* back mountain ridge */}
        <path
          d="M0 22 L14 8 L26 18 L40 6 L54 16 L66 10 L80 20 L80 24 L0 24 Z"
          fill="currentColor"
          opacity="0.55"
        />
        {/* front mountain ridge */}
        <path
          d="M0 24 L8 16 L20 22 L32 14 L46 22 L58 18 L72 24 L80 22 L80 24 Z"
          fill="currentColor"
          opacity="0.85"
        />
        {/* tiny pine on the right */}
        <path
          d="M64 24 L66 16 L62 18 L66 12 L62 14 L66 9 L70 14 L66 12 L70 18 L66 16 L68 24 Z"
          fill="currentColor"
          opacity="0.9"
        />
      </svg>
    </div>
  )
}
