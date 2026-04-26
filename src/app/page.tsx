import Image from 'next/image'
import MagicLinkForm, { InviteOnlyNote } from './login/MagicLinkForm'

export default function Home() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:gap-10 sm:py-16 md:gap-12"
      style={{ background: 'var(--color-paper)' }}
    >
      <Image
        src="/icon-192x192.png"
        alt="Bite Book"
        width={384}
        height={384}
        sizes="(min-width: 1024px) 320px, (min-width: 768px) 240px, 192px"
        className="h-48 w-48 sm:h-56 sm:w-56 md:h-64 md:w-64 lg:h-80 lg:w-80 rounded-3xl shadow-lg"
        priority
      />

      <p
        className="max-w-5xl text-center text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl"
        style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
      >
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '0.05s' }}>
          Every trip, on the record.
        </span>{' '}
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '0.30s' }}>
          Built with guides.
        </span>{' '}
        <span className="bb-tagline-clause bb-fade-up" style={{ animationDelay: '0.55s' }}>
          Lived by hunters.
        </span>
      </p>

      <div className="w-full max-w-sm">
        <MagicLinkForm />
        <InviteOnlyNote />
      </div>
    </main>
  )
}
