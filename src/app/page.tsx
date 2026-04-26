import Image from 'next/image'

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8" style={{ background: 'var(--color-paper)' }}>
      <Image
        src="/icon-192x192.png"
        alt="Bite Book"
        width={80}
        height={80}
        className="rounded-2xl shadow-md"
        priority
      />
      <h1
        className="text-4xl font-bold tracking-tight text-center"
        style={{ fontFamily: 'var(--font-barlow-condensed)', color: 'var(--color-ink)' }}
      >
        Bite Book
      </h1>
      <p className="text-center text-sm max-w-xs" style={{ color: 'var(--color-ink)', opacity: 0.6 }}>
        The digital log book for hunting and fishing guides.
      </p>
    </main>
  )
}
