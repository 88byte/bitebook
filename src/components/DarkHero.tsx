import Image from 'next/image'
import Link from 'next/link'

// Dark hero — typography-driven composition. The skull logo is the dominant
// foreground element; behind it sits a single huge word in Barlow Condensed
// at low opacity (atmospheric type, not foreground content); over the whole
// surface a subtle paper-grain texture adds tactile depth.
//
// Background word is page-specific (FIELD / TRIAL / RESET / INVITED ...).
// Tagline slot accepts either a rotating tagline or a static one-liner.
export default function DarkHero({
  backgroundWord,
  tagline,
}: {
  backgroundWord: string
  tagline: React.ReactNode
}) {
  return (
    <section
      className="relative flex flex-col items-center justify-center px-6 py-10 sm:py-14 min-h-[70vh] sm:min-h-[60vh] md:min-h-[55vh] overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 70% 55% at 50% 50%, #1A1612 0%, #0A0908 75%)',
      }}
    >
      {/* Atmospheric background word — sits behind the lockup. */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden="true"
      >
        <span className="bb-hero-word">{backgroundWord}</span>
      </div>

      {/* Centered lockup — skull + tagline. */}
      <div className="bb-hero-in relative z-10 flex flex-col items-center gap-5 sm:gap-7 w-full">
        <Link href="/" aria-label="Bite Book home">
          <Image
            src="/bb-logo.png"
            alt="Bite Book"
            width={1254}
            height={1254}
            sizes="(min-width: 1024px) 480px, (min-width: 768px) 420px, 280px"
            className="h-[280px] w-[280px] sm:h-[360px] sm:w-[360px] md:h-[420px] md:w-[420px] lg:h-[480px] lg:w-[480px]"
            priority
          />
        </Link>
        {tagline}
      </div>

      {/* Paper-grain texture overlay. mix-blend-screen with white noise:
          the grain only brightens dark pixels (the void around the skull),
          leaving the white skull itself untouched. */}
      <div className="bb-hero-grain absolute inset-0 pointer-events-none" aria-hidden="true" />
    </section>
  )
}
