import type { ReactNode } from 'react'

// v27.0a.13: shared person card used on /app/hunters (guide-side) and
// /app/h/guides (hunter-side). Big circular avatar + name + sub-line +
// optional bottom-right action (e.g. Remove). Watermark is now the
// Drive-supplied bb-card-watermark.png image (was inline MountainsArt
// SVG in v27.0a.12 — kept the SVG file in case it's reused).
export default function NetworkPersonCard({
  avatarLetter,
  name,
  sub,
  action,
}: {
  avatarLetter: string
  name: string
  sub: string
  action?: ReactNode
}) {
  return (
    <div className="bb-net-card bb-net-person">
      <div className="bb-net-watermark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bb-card-watermark.png"
          alt=""
          className="bb-net-watermark-img"
        />
      </div>
      <div className="bb-net-person-row">
        <div className="bb-person-avatar-lg" aria-hidden="true">
          {avatarLetter}
        </div>
        <div className="bb-net-person-text">
          <div className="bb-net-person-name">{name}</div>
          <div className="bb-net-person-sub">{sub}</div>
        </div>
      </div>
      {action && (
        <>
          <div className="bb-net-divider" aria-hidden="true" />
          <div className="bb-net-person-action">{action}</div>
        </>
      )}
    </div>
  )
}
