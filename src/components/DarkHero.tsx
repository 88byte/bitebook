import Image from 'next/image'
import Link from 'next/link'

// Dark hero section that anchors every auth page. Solid #0A0908 base with a
// subtle radial vignette warming the area behind the logo — no animations,
// no overlays, no competing motion.
//
// Tagline slot accepts either the rotating <RotatingTagline /> (landing/login)
// or a static string (page-specific copy on the other auth pages).
export default function DarkHero({ tagline }: { tagline: React.ReactNode }) {
  return (
    <section
      className="relative flex flex-col items-center justify-center px-6 py-10 sm:py-14 min-h-[55vh] sm:min-h-[50vh]"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 40%, #15110D 0%, #0A0908 70%)',
      }}
    >
      <div className="bb-hero-in flex flex-col items-center gap-5 sm:gap-6 w-full">
        <Link href="/" aria-label="Bite Book home">
          <Image
            src="/bb-logo.png"
            alt="Bite Book"
            width={1254}
            height={1254}
            sizes="(min-width: 1024px) 224px, (min-width: 768px) 192px, 160px"
            className="h-40 w-40 sm:h-48 sm:w-48 md:h-52 md:w-52 lg:h-56 lg:w-56"
            priority
          />
        </Link>

        {tagline}
      </div>
    </section>
  )
}
