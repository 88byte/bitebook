'use client'

import { useState } from 'react'
import { Briefcase, User, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'

type Plan = 'monthly' | 'annual'

export default function SignupForm() {
  const [businessName, setBusinessName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <div className="grid grid-cols-2 gap-2">
        <PlanCard
          label="Monthly"
          price="$9"
          period="/mo"
          selected={plan === 'monthly'}
          onClick={() => setPlan('monthly')}
        />
        <PlanCard
          label="Annual"
          price="$90"
          period="/yr"
          badge="Save 17%"
          selected={plan === 'annual'}
          onClick={() => setPlan('annual')}
        />
      </div>

      <IconField icon={<Briefcase size={18} aria-hidden="true" />} type="text" name="businessName" autoComplete="organization" placeholder="Outfitter / business name" value={businessName} onChange={setBusinessName} required />
      <IconField icon={<User size={18} aria-hidden="true" />} type="text" name="name" autoComplete="name" placeholder="Your name" value={displayName} onChange={setDisplayName} required />
      <IconField icon={<Mail size={18} aria-hidden="true" />} type="email" name="email" autoComplete="email" placeholder="Email address" value={email} onChange={setEmail} required />

      <label className="bb-field">
        <span className="bb-field-icon"><Lock size={18} aria-hidden="true" /></span>
        <input
          type={showPassword ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="bb-input bb-input-iconed bb-input-actioned"
        />
        <button
          type="button"
          className="bb-field-action"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </label>

      <label className="flex items-start gap-2 text-xs leading-tight select-none mt-1" style={{ color: 'var(--color-ink-muted)' }}>
        <input
          type="checkbox"
          checked={tos}
          onChange={(e) => setTos(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[color:var(--color-copper)]"
        />
        <span>
          I agree to the{' '}
          <a href="https://lastbite.pro/terms" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--color-copper)' }}>
            Terms of Service
          </a>
          {' '}and{' '}
          <a href="https://lastbite.pro/privacy" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--color-copper)' }}>
            Privacy Policy
          </a>.
        </span>
      </label>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <button type="submit" disabled={loading} className="bb-cta mt-1" aria-busy={loading}>
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={18} className="bb-spin" aria-hidden="true" />
            Starting trial…
          </span>
        ) : (
          'Start 7-day free trial'
        )}
      </button>
      <p className="text-center text-[10px] leading-snug" style={{ color: 'var(--color-ink-soft)' }}>
        We won&rsquo;t ask for a card. Add one any time during the trial to keep your access after day 7.
      </p>
    </form>
  )
}

function IconField(props: {
  icon: React.ReactNode
  type: string
  name: string
  autoComplete: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  minLength?: number
}) {
  return (
    <label className="bb-field">
      <span className="bb-field-icon">{props.icon}</span>
      <input
        type={props.type}
        name={props.name}
        autoComplete={props.autoComplete}
        required={props.required}
        minLength={props.minLength}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        className="bb-input bb-input-iconed"
      />
    </label>
  )
}

function PlanCard(props: { label: string; price: string; period: string; badge?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="relative rounded-xl p-3 text-left transition-all"
      style={{
        background: props.selected ? 'var(--color-copper)' : 'white',
        color: props.selected ? '#FFFFFF' : 'var(--color-ink)',
        border: `1px solid ${props.selected ? 'var(--color-copper)' : 'rgba(31,36,25,0.15)'}`,
        boxShadow: props.selected ? '0 4px 14px -4px rgba(176,108,60,0.45)' : 'none',
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
            background: props.selected ? '#FFFFFF' : 'var(--color-copper)',
            color: props.selected ? 'var(--color-copper)' : '#FFFFFF',
          }}
        >
          {props.badge}
        </span>
      )}
    </button>
  )
}
