import Image from 'next/image'
import Link from 'next/link'
import HeroTopo from './HeroTopo'

// Dark hero — flat black behind the skull (matches the logo's native black so
// the rounded-square wrapper visually disappears) with a real-looking USGS
// topographic map fragment drawn behind. Static, no animations. The skull
// sits at the imaginary peak of the mountain.
export default function DarkHero({ tagline }: { tagline: React.ReactNode }) {
  return (
    <section
      className="relative flex flex-col items-center justify-center px-6 py-10 sm:py-14 min-h-[70vh] sm:min-h-[60vh] md:min-h-[55vh] overflow-hidden"
      style={{ background: '#000000' }}
    >
      <HeroTopo />

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
    </section>
  )
}
