import type { ReactNode } from 'react'

// Generic dashboard widget frame. Used by the v24 grid layout. Visual style
// matches .bb-tile but with a built-in title row.
export default function Widget({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`bb-widget ${className ?? ''}`}>
      {(title || action) && (
        <header className="bb-widget-head">
          {title ? <h2 className="bb-widget-title">{title}</h2> : <span />}
          {action}
        </header>
      )}
      <div className="bb-widget-body">{children}</div>
    </section>
  )
}
