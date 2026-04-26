import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 sm:gap-10 sm:py-24"
      style={{ background: 'var(--color-paper)' }}
    >
      <Image
        src="/icon-192x192.png"
        alt="Bite Book"
        width={96}
        height={96}
        className="rounded-2xl shadow-md"
        priority
      />
      <p
        className="max-w-md text-center text-2xl leading-snug tracking-tight sm:text-3xl"
        style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
      >
        Every trip, on the record. Built with guides. Lived by hunters.
      </p>
      <Link
        href="/login"
        className="rounded-full px-8 py-3 text-base font-bold uppercase tracking-wide shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-paper)',
          fontFamily: 'var(--font-barlow-condensed)',
        }}
      >
        Open your logbook
      </Link>
    </main>
  )
}
