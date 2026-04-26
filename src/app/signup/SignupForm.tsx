'use client'

import { useState } from 'react'

type Plan = 'monthly' | 'annual'

export default function SignupForm() {
  const [businessName, setBusinessName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState<Plan>('annual')
  const [tos, setTos] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tos) return setError('Please accept the Terms of Service.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        displayName: displayName.trim() || businessName.trim(),
        businessName: businessName.trim(),
        plan,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Something went wrong.' }))
      setLoading(false)
      setError(error || 'Something went wrong. Please try again.')
      return
    }

    const { url } = await res.json()
    window.location.assign(url)
  }

  return (
    <div
      className="rounded-2xl p-6 backdrop-blur-sm"
      style={{
        background: 'rgba(255,255,255,0.85)',
        border: '1px solid rgba(31,36,25,0.08)',
        boxShadow: '0 1px 2px rgba(31,36,25,0.04), 0 8px 24px -12px rgba(31,36,25,0.18)',
      }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <PlanCard
            label="Monthly"
            price="$19"
            period="/mo"
            selected={plan === 'monthly'}
            onClick={() => setPlan('monthly')}
          />
          <PlanCard
            label="Annual"
            price="$204"
            period="/yr"
            badge="Save $24"
            selected={plan === 'annual'}
            onClick={() => setPlan('annual')}
          />
        </div>

        <Field name="businessName" autoComplete="organization" placeholder="Outfitter / business name" value={businessName} onChange={setBusinessName} required />
        <Field name="name" autoComplete="name" placeholder="Your name" value={displayName} onChange={setDisplayName} required />
        <Field type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} required />
        <Field type="password" name="new-password" autoComplete="new-password" placeholder="Password" value={password} onChange={setPassword} required minLength={8} />

        <label className="flex items-start gap-2 text-xs leading-tight select-none mt-1" style={{ color: 'var(--color-ink)' }}>
          <input
            type="checkbox"
            checked={tos}
            onChange={(e) => setTos(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[color:var(--color-accent)]"
          />
          <span>
            I agree to the{' '}
            <a href="https://lastbite.pro/terms" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--color-accent)' }}>
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="https://lastbite.pro/privacy" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--color-accent)' }}>
              Privacy Policy
            </a>.
          </span>
        </label>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{ background: 'var(--color-accent)', color: 'var(--color-paper)', fontFamily: 'var(--font-barlow-condensed)' }}
        >
          {loading ? 'Starting trial…' : 'Start 7-day free trial'}
        </button>
        <p className="text-center text-[10px] leading-snug" style={{ color: 'var(--color-ink)', opacity: 0.5 }}>
          We won&rsquo;t ask for a card. Add one any time during the trial to keep your access after day 7.
        </p>
      </form>
    </div>
  )
}

function Field(props: {
  type?: string
  name: string
  autoComplete: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  minLength?: number
}) {
  return (
    <input
      type={props.type ?? 'text'}
      name={props.name}
      autoComplete={props.autoComplete}
      required={props.required}
      minLength={props.minLength}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
      className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
      style={{ background: 'white', border: '1px solid rgba(31,36,25,0.15)', color: 'var(--color-ink)' }}
    />
  )
}

function PlanCard(props: { label: string; price: string; period: string; badge?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="relative rounded-xl p-3 text-left transition-all"
      style={{
        background: props.selected ? 'var(--color-accent)' : 'white',
        color: props.selected ? 'var(--color-paper)' : 'var(--color-ink)',
        border: `1px solid ${props.selected ? 'var(--color-accent)' : 'rgba(31,36,25,0.15)'}`,
        boxShadow: props.selected ? '0 4px 14px -4px rgba(180,83,9,0.4)' : 'none',
      }}
    >
      <div className="text-xs uppercase tracking-wide opacity-80" style={{ fontFamily: 'var(--font-barlow-condensed)' }}>
        {props.label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-barlow-condensed)' }}>{props.price}</span>
        <span className="text-xs opacity-80">{props.period}</span>
      </div>
      {props.badge && (
        <span
          className="absolute -top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: props.selected ? 'var(--color-paper)' : 'var(--color-accent)',
            color: props.selected ? 'var(--color-accent)' : 'var(--color-paper)',
          }}
        >
          {props.badge}
        </span>
      )}
    </button>
  )
}
