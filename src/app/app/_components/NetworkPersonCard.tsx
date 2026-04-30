import MountainsArt from './MountainsArt'
import type { ReactNode } from 'react'

// v27.0a.12: shared person card used on /app/hunters (guide-side) and
// /app/h/guides (hunter-side). Big circular avatar + name + sub-line +
// optional bottom-right action (e.g. Remove). Faded mountains+pine art
// sits in the bottom-right of the card; subtle topo-line pattern is
// applied via the parent class so the card has a textured paper feel.
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
        <MountainsArt width={170} height={70} />
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
