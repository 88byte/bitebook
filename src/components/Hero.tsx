import Image from 'next/image'
import Link from 'next/link'

// Hero — dark forest scene at top, skull/wordmark, copper bold tagline,
// light subtitle, and a small antler flourish below the subtitle (just
// above the form-card lift). Static (entrance fade only). Hero gradient-
// fades into the unified dark page bg at the bottom — no visible seam.
export default function Hero({
  taglineLine1,
  taglineLine2,
  subtitle,
}: {
  taglineLine1: string
  taglineLine2?: string
  subtitle: string
}) {
  return (
    <section className="bb-hero relative flex flex-col items-center justify-center text-center px-6 pt-8 pb-16 sm:pt-12 sm:pb-24 min-h-[68vh] sm:min-h-[62vh] md:min-h-[58vh] overflow-hidden">
      <div className="bb-hero-fade absolute inset-x-0 bottom-0 h-44 pointer-events-none" aria-hidden="true" />

      <div className="bb-hero-in relative z-10 flex flex-col items-center gap-3 sm:gap-4 max-w-md w-full">
        <Link href="/" aria-label="Bite Book home">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="(min-width: 1024px) 380px, (min-width: 768px) 320px, 210px"
            className="h-[210px] w-[210px] sm:h-[270px] sm:w-[270px] md:h-[320px] md:w-[320px] lg:h-[380px] lg:w-[380px]"
            priority
          />
        </Link>

        <h1 className="bb-tagline-bold leading-tight">
          {taglineLine1}
          {taglineLine2 ? (
            <>
              <br />
              {taglineLine2}
            </>
          ) : null}
        </h1>

        <p className="bb-subtitle max-w-[20rem] sm:max-w-[24rem]">{subtitle}</p>

        <div className="bb-flourish-row mt-2" aria-hidden="true">
          <FlourishLine />
          <Image
            src="/bb-antlers.png"
            alt=""
            width={624}
            height={624}
            sizes="(min-width: 768px) 70px, 60px"
            className="h-[60px] w-[60px] sm:h-[66px] sm:w-[66px] md:h-[70px] md:w-[70px]"
          />
          <FlourishLine />
        </div>
      </div>
    </section>
  )
}

// Simple straight horizontal line, copper at low opacity. Used as a quiet
// flanker around the small antler emblem — no diamond/pip caps.
function FlourishLine() {
  return (
    <span
      aria-hidden="true"
      className="block h-px"
      style={{ width: '50px', backgroundColor: '#B06C3C', opacity: 0.45 }}
    />
  )
}
