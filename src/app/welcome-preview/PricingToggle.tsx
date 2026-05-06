'use client'

import { useState } from 'react'

// v27.8.0-preview5 — interactive pricing toggle for the welcome page.
// Two pills (Monthly / Annual), annual default. Clicking flips the
// displayed price + period without a page reload. Pure client state;
// no server round-trip. Annual is the recommended path so it lands
// pre-selected with the "save 17%" mini-pill prominent.

type Plan = 'monthly' | 'annual'

export default function PricingToggle() {
  const [plan, setPlan] = useState<Plan>('annual')

  const isAnnual = plan === 'annual'
  const amount = isAnnual ? '$90' : '$9'
  const period = isAnnual ? 'a year.' : 'a month.'
  const equivalence = isAnnual
    ? "That's $7.50 a month."
    : '$108 a year if you stay on monthly.'

  return (
    <>
      <div className="bb-mkt-price-toggle-row" role="tablist" aria-label="Billing period">
        <button
          type="button"
          role="tab"
          aria-selected={!isAnnual}
          onClick={() => setPlan('monthly')}
          className={`bb-mkt-price-toggle-btn ${!isAnnual ? 'is-active' : ''}`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAnnual}
          onClick={() => setPlan('annual')}
          className={`bb-mkt-price-toggle-btn ${isAnnual ? 'is-active' : ''}`}
        >
          Annual
          <span className="bb-mkt-price-save-pill" aria-label="save 17 percent">
            Save 17%
          </span>
        </button>
      </div>

      <div className="bb-mkt-price-amount-row" aria-live="polite">
        <span className="bb-mkt-price-amount-big">{amount}</span>
        <span className="bb-mkt-price-amount-period">{period}</span>
      </div>
      <p className="bb-mkt-price-equiv">{equivalence}</p>
    </>
  )
}
