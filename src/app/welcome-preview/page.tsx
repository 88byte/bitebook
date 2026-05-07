import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  Calendar,
  Users as UsersIcon,
  Wallet,
  FileText,
  ListChecks,
  PenLine,
  Star,
  MoreHorizontal,
} from 'lucide-react'

import PricingToggle from './PricingToggle'

// v27.8.0-preview3 — full art-directed pass. NOT a wireframe with
// brand colors painted on. The page is the visual; typography is the
// hero; the photo is the page. Borrowing from Field Mag, Garage,
// editorial outdoor magazines — display type at scale, copper accent
// rules, asymmetric grid, hand-drawn SVG accents, before/after as the
// signature moment, dark cinematic close.
//
// PREVIEW route only. Production /welcome lands separately with
// `robots: 'index, follow'` + canonical pointing here.
export const metadata: Metadata = {
  title: 'Bite Book — Digital log book for hunting & fishing guides',
  description:
    "Paper logs are a tax on your time. Bite Book files your state's trip log from your phone. 7 days free. No card.",
  robots: 'noindex, nofollow',
  alternates: { canonical: 'https://bitebook.lastbite.pro/welcome-preview' },
  openGraph: {
    type: 'website',
    title: 'Bite Book — Built for guides. Made for the field.',
    description:
      "Paper logs are a tax on your time. Bite Book files your state's trip log from your phone. 7 days free. No card.",
    url: 'https://bitebook.lastbite.pro/welcome-preview',
    siteName: 'Bite Book',
    images: [
      {
        url: 'https://bitebook.lastbite.pro/banners/welcome-hero.png',
        width: 1672,
        height: 941,
        alt: 'Bite Book — built for hunting and fishing guides',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bite Book — Built for guides. Made for the field.',
    description: "Paper logs are a tax on your time. Bite Book files your state's trip log from your phone.",
    images: ['https://bitebook.lastbite.pro/banners/welcome-hero.png'],
  },
  keywords: [
    'hunt log app',
    'fishing guide log',
    'trip log software',
    'guide license tracker',
    'state hunt report',
    'warden share',
    'digital hunt log',
    'outfitter software',
    'hunting guide app',
  ],
}

const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bite Book',
  url: 'https://bitebook.lastbite.pro/',
  logo: 'https://bitebook.lastbite.pro/bb-logo-mark.png',
  description: 'Digital log book for hunting and fishing guides.',
  parentOrganization: { '@type': 'Organization', name: 'Last Bite Pro', url: 'https://lastbite.pro/' },
  contactPoint: { '@type': 'ContactPoint', contactType: 'Customer Support', email: 'support@lastbite.pro' },
}
const PRODUCT_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Bite Book',
  description:
    'Digital log book for hunting and fishing guides. Trip tracking, state harvest reports, hunter coordination, warden share.',
  brand: { '@type': 'Brand', name: 'Bite Book' },
  offers: [
    {
      '@type': 'Offer',
      price: '9.00', priceCurrency: 'USD',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '9.00', priceCurrency: 'USD', unitText: 'MON' },
      availability: 'https://schema.org/InStock', url: 'https://bitebook.lastbite.pro/signup',
    },
    {
      '@type': 'Offer',
      price: '90.00', priceCurrency: 'USD',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: '90.00', priceCurrency: 'USD', unitText: 'ANN' },
      availability: 'https://schema.org/InStock', url: 'https://bitebook.lastbite.pro/signup',
    },
  ],
}
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'Does it fill my state\'s trip log?', acceptedAnswer: { '@type': 'Answer', text: "Yes. Upload your state's trip log PDF once and Bite Book maps every field for you. We support every state." } },
    { '@type': 'Question', name: 'What does it cost my clients?', acceptedAnswer: { '@type': 'Answer', text: "Nothing. Your clients use Bite Book at no cost. Invite them by email, they sign in, see their trips, link their tags. That's it." } },
    { '@type': 'Question', name: "I'm a one-person outfit. Worth it for me?", acceptedAnswer: { '@type': 'Answer', text: "That's exactly who Bite Book was built for. $7.50 a month on the annual plan. Less than a tank of gas." } },
  ],
}

export default function WelcomePreviewPage() {
  return (
    <main className="bb-mkt">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />

      {/* ── HERO — cinematic full-bleed ─────────────────────────── */}
      <section className="bb-mkt-hero" aria-labelledby="bb-mkt-hero-title">
        {/* Background photo, dark-tinted via gradient overlay below */}
        <div className="bb-mkt-hero-bg" aria-hidden="true">
          <Image
            src="/banners/welcome-hero.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="bb-mkt-hero-bg-img"
          />
          <div className="bb-mkt-hero-veil" />
          <div className="bb-mkt-hero-topo" />
        </div>

        {/* Brand mark in the top-left corner */}
        <header className="bb-mkt-hero-corner" aria-label="Bite Book brand">
          <Image
            src="/bb-logo-mark.png"
            alt="Bite Book"
            width={1024}
            height={1024}
            sizes="48px"
            className="bb-mkt-hero-mark"
            priority
          />
          <span className="bb-mkt-hero-wordmark">Bite Book</span>
        </header>

        {/* Compass-rule decorative mark in the top-right */}
        <span className="bb-mkt-hero-decor-tr" aria-hidden="true">
          <Compass />
        </span>

        {/* Main headline + CTA, asymmetric — anchored bottom-left */}
        <div className="bb-mkt-hero-stack">
          <p className="bb-mkt-hero-eyebrow">
            <span className="bb-mkt-hero-eyebrow-rule" aria-hidden="true" />
            For hunting & fishing guides &middot; field-tested
          </p>
          <h1 id="bb-mkt-hero-title" className="bb-mkt-hero-title">
            <span className="bb-mkt-hero-title-line">Less paperwork.</span>
            <span className="bb-mkt-hero-title-line bb-mkt-hero-title-accent">More hunting.</span>
          </h1>
          <p className="bb-mkt-hero-sub">
            Built for guides who&rsquo;d rather be in the field than in front of a printer. Bite Book files your
            state&rsquo;s trip log from your phone &mdash; in less time than it takes to clean a rifle.
          </p>
          <div className="bb-mkt-hero-cta-row">
            <Link href="/signup" className="bb-mkt-cta">
              <span>Start 7-day free trial</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <ul className="bb-mkt-hero-stat-row" aria-label="What you get">
            <li><strong>50</strong><span>states</span></li>
            <li><strong>0</strong><span>hunter fees</span></li>
            <li><strong>7</strong><span>days free</span></li>
            <li><strong>5 min</strong><span>to set up</span></li>
          </ul>
        </div>

        {/* Scroll down hint */}
        <span className="bb-mkt-hero-scroll" aria-hidden="true">
          <ArrowDown size={14} />
          Scroll
        </span>
      </section>

      {/* ── MANIFESTO STRIP — pull-quote between hero and pillars ── */}
      <aside className="bb-mkt-manifesto" aria-label="Bite Book manifesto">
        <div className="bb-mkt-manifesto-inner">
          <p className="bb-mkt-manifesto-mark" aria-hidden="true">&ldquo;</p>
          <p className="bb-mkt-manifesto-text">
            Paper logs are a tax on your time.
            <br />
            <span className="bb-mkt-manifesto-accent">Stop paying it.</span>
          </p>
        </div>
      </aside>

      {/* ── PILLARS — asymmetric, hand-drawn iconography ────────── */}
      <section className="bb-mkt-pillars-wrap" aria-labelledby="bb-mkt-pillars-title">
        <div className="bb-mkt-container">
          <div className="bb-mkt-pillars-head">
            <p className="bb-mkt-section-eyebrow">What it does</p>
            <h2 id="bb-mkt-pillars-title" className="bb-mkt-section-title">
              The truck-cab paperwork problem,<br />
              <span className="bb-mkt-headline-accent">solved</span>.
            </h2>
            <p className="bb-mkt-section-sub">
              Four things eat your evening after a hunt. Bite Book takes care of all of them before you finish your beer.
            </p>
          </div>

          <div className="bb-mkt-pillars">
            <article className="bb-mkt-pillar bb-mkt-pillar-lg">
              <span className="bb-mkt-pillar-icon" aria-hidden="true"><AntlersIcon /></span>
              <p className="bb-mkt-pillar-num">01</p>
              <h3 className="bb-mkt-pillar-title">Stop typing in the truck.</h3>
              <p className="bb-mkt-pillar-body">
                Add hunters. Log harvests. Generate reports. All from your phone &mdash; same hand
                you&rsquo;re holding the coffee with. Bite Book has every field your state asks for,
                already there, ready to fill.
              </p>
            </article>

            <article className="bb-mkt-pillar">
              <span className="bb-mkt-pillar-icon" aria-hidden="true"><FormIcon /></span>
              <p className="bb-mkt-pillar-num">02</p>
              <h3 className="bb-mkt-pillar-title">We learned your state&rsquo;s log so you don&rsquo;t have to.</h3>
              <p className="bb-mkt-pillar-body">
                Upload your state&rsquo;s trip log PDF once. Bite Book maps every field. Every state, every
                activity &mdash; we&rsquo;ve got you covered.
              </p>
            </article>

            <article className="bb-mkt-pillar">
              <span className="bb-mkt-pillar-icon" aria-hidden="true"><PeopleIcon /></span>
              <p className="bb-mkt-pillar-num">03</p>
              <h3 className="bb-mkt-pillar-title">Your clients hunt for free.</h3>
              <p className="bb-mkt-pillar-body">
                The hunters and anglers you guide use Bite Book at no cost. They get the app, they sign
                waivers, they link tags &mdash; all on their phone, all included.
              </p>
            </article>

            <article className="bb-mkt-pillar">
              <span className="bb-mkt-pillar-icon" aria-hidden="true"><BadgeIcon /></span>
              <p className="bb-mkt-pillar-num">04</p>
              <h3 className="bb-mkt-pillar-title">Warden walks up. You&rsquo;re ready.</h3>
              <p className="bb-mkt-pillar-body">
                One tap, signed PDF. Show it on your phone or send a link. Real signatures.
                Real timestamps. Real audit trail.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* v27.8.0-preview4 — before/after section removed. Paper-logbook
          mockup wasn't landing visually and the made-up form names ran
          counter to Flavio's "don't get cute" direction. */}

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="bb-mkt-steps-wrap" aria-labelledby="bb-mkt-steps-title">
        <div className="bb-mkt-container">
          <p className="bb-mkt-section-eyebrow">How it works</p>
          <h2 id="bb-mkt-steps-title" className="bb-mkt-section-title">
            Three steps. <span className="bb-mkt-headline-accent">No manual.</span>
          </h2>
          <ol className="bb-mkt-steps">
            <li className="bb-mkt-step">
              <span className="bb-mkt-step-num">01</span>
              <h3 className="bb-mkt-step-title">Sign up.</h3>
              <p className="bb-mkt-step-body">
                7 days free. No card. Pick your state and you&rsquo;re in.
              </p>
            </li>
            <li className="bb-mkt-step bb-mkt-step-mid">
              <span className="bb-mkt-step-connector" aria-hidden="true" />
              <span className="bb-mkt-step-num">02</span>
              <h3 className="bb-mkt-step-title">Add a trip.</h3>
              <p className="bb-mkt-step-body">
                Pull in your hunters, set the dates, mark species and zone. Bite Book remembers it all.
              </p>
            </li>
            <li className="bb-mkt-step">
              <span className="bb-mkt-step-connector" aria-hidden="true" />
              <span className="bb-mkt-step-num">03</span>
              <h3 className="bb-mkt-step-title">File the report.</h3>
              <p className="bb-mkt-step-body">
                Tap Generate. Bite Book fills your state&rsquo;s PDF, signs it, and you&rsquo;re done before dinner.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── PRODUCT GALLERY — three real screens (v27.8.0-preview6) ── */}
      {/* Three art-directed product photos showing the live app. Stacks
          on mobile, 3-up at desktop. The side glow pulls the dark page
          surface into the rail so the photos don't feel like tiles
          dropped on a strip. */}
      <section
        className="bb-mkt-gallery-wrap"
        aria-label="Bite Book product gallery"
      >
        <div className="bb-mkt-container">
          <div className="bb-mkt-gallery">
            <figure className="bb-mkt-gallery-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/welcome-trips.png"
                alt="Bite Book trips dashboard showing upcoming hunts, hunter assignments, and locations"
                className="bb-mkt-gallery-img"
                loading="lazy"
                width={1536}
                height={1024}
              />
              <figcaption className="bb-mkt-gallery-cap">
                <span className="bb-mkt-gallery-eyebrow">Trips</span>
                <span className="bb-mkt-gallery-title">Every hunt, on the line.</span>
              </figcaption>
            </figure>
            <figure className="bb-mkt-gallery-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/welcome-docs.png"
                alt="Bite Book document library showing waivers, harvest logs, and signed resources"
                className="bb-mkt-gallery-img"
                loading="lazy"
                width={1536}
                height={1024}
              />
              <figcaption className="bb-mkt-gallery-cap">
                <span className="bb-mkt-gallery-eyebrow">Documents</span>
                <span className="bb-mkt-gallery-title">Waivers signed. Logs filed.</span>
              </figcaption>
            </figure>
            <figure className="bb-mkt-gallery-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/welcome-reviews.png"
                alt="Bite Book reviews from hunters showing star ratings and trip feedback"
                className="bb-mkt-gallery-img"
                loading="lazy"
                width={1536}
                height={1024}
              />
              <figcaption className="bb-mkt-gallery-cap">
                <span className="bb-mkt-gallery-eyebrow">Reviews</span>
                <span className="bb-mkt-gallery-title">Built on what hunters say.</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── FEATURES — what's actually in the app ─────────────────── */}
      <section
        className="bb-mkt-features-wrap"
        aria-labelledby="bb-mkt-features-title"
      >
        <div className="bb-mkt-container">
          <p className="bb-mkt-section-eyebrow">Inside Bite Book</p>
          <h2 id="bb-mkt-features-title" className="bb-mkt-section-title">
            Everything a guide actually uses.
          </h2>
          <p className="bb-mkt-section-sub">
            Not a feature dump. The real things you reach for between sunup and the drive home.
          </p>

          <div className="bb-mkt-features">
            <FeatureCard icon={Calendar} title="Track your hunts" body="Trips, dates, locations, weather notes &mdash; all in one place." />
            <FeatureCard icon={UsersIcon} title="Manage your clients" body="Hunter profiles, contact info, status. Always current." />
            <FeatureCard icon={Wallet} title="Wallet" body="Tags, licenses, permits, business credentials. State proof in one tap." />
            <FeatureCard icon={FileText} title="Documents" body="Waivers, harvest logs, resources &mdash; organized and signed." />
            <FeatureCard icon={ListChecks} title="Checklists for clients" body="What to bring, what to know before the hunt. Auto-shared." />
            <FeatureCard icon={PenLine} title="Digital trip logs" body="Fill your state's trip log in seconds. Sign and share." />
            <FeatureCard icon={Star} title="Reviews from clients" body="Feedback after every trip. Build your reputation." />
            <FeatureCard icon={MoreHorizontal} title="And more." body="New tools shipped every week. Built with guides, for guides." />
          </div>
        </div>
      </section>

      {/* ── PRICING — confident statement, not a card ─────────────── */}
      <section className="bb-mkt-pricing-wrap" id="pricing" aria-labelledby="bb-mkt-pricing-title">
        <div className="bb-mkt-container">
          <p className="bb-mkt-section-eyebrow bb-mkt-section-eyebrow-dark">Pricing, plain</p>
          <h2 id="bb-mkt-pricing-title" className="bb-mkt-pricing-headline-static">
            One plan. Two billing options.
          </h2>
          <PricingToggle />
          <p className="bb-mkt-pricing-statement">
            <span className="bb-mkt-pricing-accent">Less than a single guide license fee.</span>
          </p>

          <ul className="bb-mkt-pricing-list">
            <li><CheckCircle2 size={16} aria-hidden="true" /> All 50 states &middot; hunting and fishing</li>
            <li><CheckCircle2 size={16} aria-hidden="true" /> Unlimited trips, clients, and trip log PDFs</li>
            <li><CheckCircle2 size={16} aria-hidden="true" /> E-signatures on waivers and reports</li>
            <li><CheckCircle2 size={16} aria-hidden="true" /> Wallet for license, insurance, credentials</li>
            <li><CheckCircle2 size={16} aria-hidden="true" /> Warden share &middot; same-day email support</li>
            <li><CheckCircle2 size={16} aria-hidden="true" /> No fees for your clients</li>
          </ul>

          <div className="bb-mkt-pricing-cta-row">
            <Link href="/signup" className="bb-mkt-cta bb-mkt-cta-large">
              <span>Start 7-day free trial</span>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <p className="bb-mkt-pricing-fineprint">
              7 days free &middot; no card required &middot; cancel anytime. Or pay <strong>$9/month</strong> if you&rsquo;d rather.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="bb-mkt-faq-wrap" id="faq" aria-labelledby="bb-mkt-faq-title">
        <div className="bb-mkt-container bb-mkt-container-narrow">
          <p className="bb-mkt-section-eyebrow">Things real guides have asked us</p>
          <h2 id="bb-mkt-faq-title" className="bb-mkt-section-title">
            Real answers, in plain English.
          </h2>
          <div className="bb-mkt-faq">
            <Faq q="Does it fill my state's trip log?">
              Yes. Upload your state&rsquo;s trip log PDF once and Bite Book maps every field for you.
              Every state, every activity. Hunting and fishing.
            </Faq>
            <Faq q="What does it cost my clients?">
              Nothing. The hunters and anglers you guide use Bite Book at no cost. Invite them by email,
              they sign in, see their trips, link their tags. That&rsquo;s it.
            </Faq>
            <Faq q="What about my insurance and license docs?">
              They live in your wallet. Bite Book reminds you when something&rsquo;s about to expire so
              you&rsquo;re never caught without proof.
            </Faq>
            <Faq q="Can my clients sign waivers from their phone?">
              Yes. They tap the link in their email, sign on their phone, and you get the signed PDF
              immediately. Same with the trip log after the hunt.
            </Faq>
            <Faq q="How do I cancel?">
              Tap once in Settings. End your trial before day 7 and you pay nothing. Cancel anytime
              after &mdash; you keep access until your billing period ends.
            </Faq>
            <Faq q="I'm a one-person outfit. Worth it for me?">
              That&rsquo;s exactly who Bite Book was built for. The annual plan is $7.50 a month. Less
              than a tank of gas.
            </Faq>
          </div>
          <p className="bb-mkt-faq-foot">
            Got a question we missed? Email{' '}
            <a href="mailto:support@lastbite.pro" className="bb-mkt-inline-link">
              support@lastbite.pro
            </a>
            . Same-day reply, usually faster.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA — cinematic dark close ─────────────────────── */}
      <section className="bb-mkt-final" aria-labelledby="bb-mkt-final-title">
        <div className="bb-mkt-final-topo" aria-hidden="true" />
        <div className="bb-mkt-container bb-mkt-container-narrow">
          <p className="bb-mkt-section-eyebrow bb-mkt-section-eyebrow-dark">Tomorrow, 4:30 AM</p>
          <h2 id="bb-mkt-final-title" className="bb-mkt-final-title">
            Be ready before<br />
            the truck lights<br />
            <span className="bb-mkt-final-accent">come on.</span>
          </h2>
          <p className="bb-mkt-final-sub">
            Set up Bite Book in five minutes tonight. Skip the paperwork tomorrow.
          </p>
          <Link href="/signup" className="bb-mkt-cta bb-mkt-cta-large bb-mkt-final-cta">
            <span>Start 7-day free trial</span>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <p className="bb-mkt-final-fineprint">
            7 days free &middot; no card &middot; cancel anytime
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="bb-mkt-footer" aria-label="Site footer">
        <div className="bb-mkt-container bb-mkt-footer-inner">
          <div className="bb-mkt-footer-brand">
            <div className="bb-mkt-footer-brand-row">
              <Image src="/bb-logo-mark.png" alt="" width={1024} height={1024} sizes="40px" className="bb-mkt-footer-mark" />
              <span className="bb-mkt-footer-brand-text">Bite Book</span>
            </div>
            <p className="bb-mkt-footer-tag">
              The digital log book for hunting and fishing guides. Built by guides, for guides. A Last Bite Pro product.
            </p>
            <a href="mailto:support@lastbite.pro" className="bb-mkt-footer-support">support@lastbite.pro</a>
          </div>
          <div className="bb-mkt-footer-cols">
            <FooterCol heading="Product" links={[
              { label: 'Sign up', href: '/signup' },
              { label: 'Sign in', href: '/login' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'FAQ', href: '#faq' },
            ]} />
            <FooterCol heading="Company" links={[
              { label: 'Last Bite Pro', href: 'https://lastbite.pro/', external: true },
            ]} />
            <FooterCol heading="Legal" links={[
              { label: 'Terms', href: 'https://lastbite.pro/terms', external: true },
              { label: 'Privacy', href: 'https://lastbite.pro/privacy', external: true },
              { label: 'Support', href: 'mailto:support@lastbite.pro' },
            ]} />
          </div>
        </div>
        <div className="bb-mkt-footer-bottom">
          <span>© 2026 Bite Book</span>
          <span className="bb-mkt-footer-bottom-divider" aria-hidden="true">/</span>
          <span>Field-tested for guides and hunters</span>
        </div>
      </footer>

      <style>{styles}</style>
    </main>
  )
}

/* ── Hand-drawn SVG accents ──────────────────────────────────── */
function Compass() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="20" opacity="0.45" />
      <path d="M32 8 L32 14 M32 50 L32 56 M8 32 L14 32 M50 32 L56 32" />
      <path d="M32 14 L37 32 L32 50 L27 32 Z" fill="currentColor" opacity="0.85" />
      <circle cx="32" cy="32" r="2.2" fill="currentColor" />
    </svg>
  )
}
function AntlersIcon() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 50 L32 38" />
      <path d="M32 38 C 28 32 20 30 12 30 C 16 26 22 24 26 22" />
      <path d="M26 22 L24 16 M26 22 L20 18" />
      <path d="M32 38 C 36 32 44 30 52 30 C 48 26 42 24 38 22" />
      <path d="M38 22 L40 16 M38 22 L44 18" />
      <path d="M28 50 L36 50" />
    </svg>
  )
}
function FormIcon() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 10 L46 10 L50 14 L50 54 L14 54 Z" />
      <path d="M44 10 L44 14 L50 14" />
      <path d="M20 24 L40 24 M20 32 L40 32 M20 40 L34 40" />
      <path d="M22 46 L28 50 L42 36" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="24" cy="22" r="6" />
      <circle cx="42" cy="24" r="5" />
      <path d="M12 50 C 14 40 20 36 24 36 C 28 36 34 40 36 50" />
      <path d="M34 50 C 36 42 40 38 44 38 C 48 38 52 42 54 50" />
    </svg>
  )
}
function BadgeIcon() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 8 L52 16 L52 32 C 52 42 44 50 32 56 C 20 50 12 42 12 32 L12 16 Z" />
      <path d="M22 32 L30 40 L44 24" strokeWidth="2.4" />
    </svg>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Calendar
  title: string
  body: string
}) {
  return (
    <article className="bb-mkt-feature-card">
      <span className="bb-mkt-feature-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <h3 className="bb-mkt-feature-title">{title}</h3>
      <p className="bb-mkt-feature-body" dangerouslySetInnerHTML={{ __html: body }} />
    </article>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="bb-mkt-faq-item">
      <summary>{q}</summary>
      <div className="bb-mkt-faq-body">{children}</div>
    </details>
  )
}

function FooterCol({ heading, links }: { heading: string; links: Array<{ label: string; href: string; external?: boolean }> }) {
  return (
    <div>
      <p className="bb-mkt-footer-col-heading">{heading}</p>
      <ul className="bb-mkt-footer-col-list">
        {links.map((l) => (
          <li key={l.label}>
            {l.external
              ? <a href={l.href} target="_blank" rel="noreferrer noopener">{l.label}</a>
              : <Link href={l.href}>{l.label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Styles (page-scoped) ────────────────────────────────────── */
// Topo SVG pattern, used as a background-image on dark sections for a
// wilderness texture. Kept tiny + tile-friendly.
const TOPO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='320' height='320'>
    <g fill='none' stroke='%23B06C3C' stroke-opacity='0.18' stroke-width='0.7'>
      <path d='M -20 60 Q 60 30 140 60 T 340 60' />
      <path d='M -20 100 Q 80 70 160 100 T 340 100' />
      <path d='M -20 140 Q 60 110 140 140 T 340 140' />
      <path d='M -20 180 Q 100 150 180 180 T 340 180' />
      <path d='M -20 220 Q 60 190 140 220 T 340 220' />
      <path d='M -20 260 Q 80 230 160 260 T 340 260' />
    </g>
  </svg>`
)}`

const styles = `
.bb-mkt {
  display: block;
  color: var(--color-ink);
  background: var(--color-paper);
}

/* ════════════════════════════════════════════════════════════════
   HERO — cinematic, full-bleed, asymmetric
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-hero {
  position: relative;
  min-height: 92vh;
  background: var(--color-page-bg);
  color: #F4EFE5;
  overflow: hidden;
  isolation: isolate;
}
@media (min-width: 768px) { .bb-mkt-hero { min-height: 96vh; } }

.bb-mkt-hero-bg {
  position: absolute; inset: 0; z-index: 0;
}
.bb-mkt-hero-bg-img {
  object-fit: cover;
  object-position: center;
  filter: grayscale(0.25) contrast(1.05) saturate(0.85);
}
.bb-mkt-hero-veil {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(11,8,6,0.55) 0%, rgba(11,8,6,0.35) 40%, rgba(11,8,6,0.85) 100%),
    linear-gradient(110deg, rgba(11,8,6,0.85) 0%, rgba(11,8,6,0.45) 50%, rgba(31,36,25,0.55) 100%);
  mix-blend-mode: multiply;
}
.bb-mkt-hero-topo {
  position: absolute; inset: 0;
  background-image: url("${TOPO}");
  background-repeat: repeat;
  opacity: 0.55;
  mix-blend-mode: screen;
}

.bb-mkt-hero-corner {
  position: absolute;
  top: 1.4rem;
  left: 1.5rem;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}
@media (min-width: 768px) {
  .bb-mkt-hero-corner { top: 2rem; left: 2.5rem; }
}
.bb-mkt-hero-mark {
  width: 36px; height: 36px;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.35));
}
@media (min-width: 768px) { .bb-mkt-hero-mark { width: 44px; height: 44px; } }
.bb-mkt-hero-wordmark {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.88rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #FFFFFF;
}

.bb-mkt-hero-decor-tr {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 4;
  color: rgba(176, 108, 60, 0.7);
  display: none;
}
@media (min-width: 768px) {
  .bb-mkt-hero-decor-tr { display: inline-flex; top: 2rem; right: 2.5rem; }
}

.bb-mkt-hero-stack {
  position: relative;
  z-index: 3;
  max-width: 1200px;
  margin: 0 auto;
  padding: 8rem 1.5rem 4.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* v27.9.2 — was min-height 92vh. On 1080p laptops (about 720px
     viewport after browser chrome) 92vh dominated the fold and
     pushed the stats row off-screen. Clamp to a reasonable range so
     the hero still anchors the page on desktop without overflowing
     on shorter screens. */
  min-height: clamp(640px, 84vh, 880px);
  justify-content: flex-end;
}
@media (min-width: 768px) {
  .bb-mkt-hero-stack { padding: 10rem 3rem 6rem; gap: 1.4rem; max-width: 1280px; }
}

.bb-mkt-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(244, 239, 229, 0.78);
  margin: 0;
}
.bb-mkt-hero-eyebrow-rule {
  display: inline-block;
  width: 2.2rem;
  height: 1px;
  background: var(--color-copper);
}

.bb-mkt-hero-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(3.3rem, 12vw, 9rem);
  line-height: 0.92;
  letter-spacing: -0.005em;
  color: #FFFFFF;
  margin: 0;
  text-shadow: 0 4px 24px rgba(0,0,0,0.45);
}
.bb-mkt-hero-title-line {
  display: block;
  text-transform: none;
}
.bb-mkt-hero-title-accent {
  color: var(--color-copper);
}

.bb-mkt-hero-sub {
  font-family: var(--font-barlow);
  font-size: 1.05rem;
  line-height: 1.5;
  color: rgba(244, 239, 229, 0.88);
  margin: 0.4rem 0 0;
  max-width: 36rem;
}
@media (min-width: 768px) { .bb-mkt-hero-sub { font-size: 1.18rem; max-width: 44rem; } }

.bb-mkt-hero-cta-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.85rem;
  margin-top: 1.5rem;
}
@media (min-width: 540px) { .bb-mkt-hero-cta-row { flex-direction: row; align-items: center; gap: 1.5rem; } }

.bb-mkt-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--color-copper);
  color: #FFFFFF;
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.88rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  padding: 1.05rem 1.6rem;
  border-radius: 999px;
  text-decoration: none;
  transition: background 200ms, transform 200ms, box-shadow 200ms;
  box-shadow: 0 12px 28px rgba(176, 108, 60, 0.38);
}
.bb-mkt-cta:hover { background: #C07845; transform: translateY(-1px); box-shadow: 0 16px 36px rgba(176, 108, 60, 0.5); }
.bb-mkt-cta:active { background: #8C5530; transform: translateY(0); }
.bb-mkt-cta-large {
  font-size: 0.95rem;
  padding: 1.2rem 2rem;
  letter-spacing: 0.2em;
}

.bb-mkt-cta-secondary {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(244, 239, 229, 0.85);
  text-decoration: none;
  border-bottom: 1px solid rgba(244, 239, 229, 0.35);
  padding-bottom: 0.15rem;
}
.bb-mkt-cta-secondary:hover { color: #FFFFFF; border-bottom-color: #FFFFFF; }

.bb-mkt-hero-stat-row {
  list-style: none;
  padding: 0;
  margin: 2rem 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.5rem;
  border-top: 1px solid rgba(244, 239, 229, 0.16);
  padding-top: 1.5rem;
  max-width: 28rem;
}
@media (min-width: 540px) { .bb-mkt-hero-stat-row { grid-template-columns: repeat(4, minmax(0, 1fr)); max-width: none; } }
.bb-mkt-hero-stat-row li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.bb-mkt-hero-stat-row strong {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.85rem;
  color: #FFFFFF;
  line-height: 1;
}
.bb-mkt-hero-stat-row span {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(244, 239, 229, 0.55);
}

.bb-mkt-hero-scroll {
  position: absolute;
  bottom: 1.2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: none;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(244, 239, 229, 0.55);
  animation: bb-mkt-bob 2.8s ease-in-out infinite;
}
@media (min-width: 768px) { .bb-mkt-hero-scroll { display: inline-flex; } }
@keyframes bb-mkt-bob {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 6px); }
}

/* ════════════════════════════════════════════════════════════════
   MANIFESTO — pull-quote strip
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-manifesto {
  background: var(--color-page-bg);
  color: #F4EFE5;
  padding: 4rem 1.5rem;
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.bb-mkt-manifesto::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("${TOPO}");
  background-repeat: repeat;
  opacity: 0.4;
  z-index: 0;
}
@media (min-width: 768px) { .bb-mkt-manifesto { padding: 6rem 2rem; } }
.bb-mkt-manifesto-inner {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto;
  text-align: left;
}
.bb-mkt-manifesto-mark {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(4rem, 12vw, 8rem);
  color: var(--color-copper);
  line-height: 0.6;
  margin: 0 0 0.5rem;
  user-select: none;
}
.bb-mkt-manifesto-text {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(2.1rem, 6.5vw, 4.8rem);
  line-height: 1.05;
  color: #FFFFFF;
  margin: 0;
  letter-spacing: -0.005em;
}
.bb-mkt-manifesto-accent {
  color: var(--color-copper);
}

/* ════════════════════════════════════════════════════════════════
   PILLARS — asymmetric
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-pillars-wrap {
  background: var(--color-paper);
  color: var(--color-ink);
  padding: 5rem 1.5rem 5rem;
}
@media (min-width: 768px) { .bb-mkt-pillars-wrap { padding: 7rem 2rem; } }

.bb-mkt-container { max-width: 1200px; margin: 0 auto; }
.bb-mkt-container-narrow { max-width: 760px; margin: 0 auto; }

.bb-mkt-pillars-head {
  max-width: 56rem;
  margin: 0 0 3rem;
}

.bb-mkt-section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--color-copper);
  margin: 0 0 1rem;
}
.bb-mkt-section-eyebrow::before {
  content: '';
  display: inline-block;
  width: 2rem;
  height: 1px;
  background: var(--color-copper);
}
.bb-mkt-section-eyebrow-dark { color: #D89169; }

.bb-mkt-section-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(2.1rem, 5.5vw, 3.6rem);
  line-height: 1.04;
  letter-spacing: -0.005em;
  margin: 0 0 1rem;
  color: var(--color-ink);
}
.bb-mkt-section-title-dark { color: #FFFFFF; }
.bb-mkt-section-sub {
  font-family: var(--font-barlow);
  font-size: 1.05rem;
  line-height: 1.55;
  color: var(--color-ink-soft);
  margin: 0;
  max-width: 36rem;
}
.bb-mkt-headline-strike {
  position: relative;
  display: inline-block;
  color: var(--color-copper);
}
.bb-mkt-headline-strike::after {
  content: '';
  position: absolute;
  left: -2%;
  right: -2%;
  top: 56%;
  height: 6px;
  background: var(--color-copper);
  transform: rotate(-2deg);
  opacity: 0.45;
}
.bb-mkt-headline-accent { color: var(--color-copper); }

.bb-mkt-pillars {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
/* v27.9.2 — pillars desktop fix. Pre-v27.9.2 the wrap declared
   repeat 6 minmax 0 1fr and the .bb-mkt-pillar-lg modifier was
   supposed to span more columns to create an asymmetric layout —
   but the span rule was never written, so card 01 auto-flowed into
   1 column, card 02 stretched, and rows 2 broke unevenly. Two
   surgical changes:
   At minimum 768px: 2x2 grid; cards keep their density, read as a
     clear quartet, none stretches into oblivion.
   At minimum 1280px: 4-col row of equal cards on wide shells where
     the 2x2 has too much vertical scroll.
   No JSX touch — .bb-mkt-pillar-lg continues to render as a normal
   pillar; the modifier class becomes harmless. */
@media (min-width: 768px) {
  .bb-mkt-pillars {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
}
@media (min-width: 80rem) {
  .bb-mkt-pillars {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.1rem;
  }
}

.bb-mkt-pillar {
  position: relative;
  background: #FFFFFF;
  border: 1px solid var(--color-card-divider);
  border-radius: 18px;
  padding: 1.85rem 1.6rem 1.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 220ms, transform 220ms, box-shadow 220ms;
}
.bb-mkt-pillar:hover {
  border-color: rgba(176, 108, 60, 0.5);
  transform: translateY(-3px);
  box-shadow: 0 24px 48px rgba(11, 8, 6, 0.08);
}
/* v27.9.7 — legacy :nth-of-type(2/3/4) span rules removed. They were
   higher-specificity overrides from a long-dead repeat(6, 1fr) layout
   and were silently destroying every grid-template-columns rule above.
   Pillars now lay out from the bb-mkt-pillars grid-template alone, with
   the asymmetric featured layout defined inside the v27.9.7 desktop
   block at the bottom of this file. */
.bb-mkt-pillar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 18px;
  background: linear-gradient(135deg, #2a221c, #1F2419);
  color: var(--color-copper);
  margin-bottom: 0.65rem;
}
.bb-mkt-pillar-num {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.22em;
  color: var(--color-copper);
  margin: 0;
  text-transform: uppercase;
}
.bb-mkt-pillar-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.55rem;
  line-height: 1.1;
  margin: 0 0 0.35rem;
  color: var(--color-ink);
}
.bb-mkt-pillar-lg .bb-mkt-pillar-title { font-size: 1.85rem; }
.bb-mkt-pillar-body {
  font-family: var(--font-barlow);
  font-size: 0.96rem;
  line-height: 1.55;
  color: var(--color-ink-muted);
  margin: 0;
}
.bb-mkt-pillar-lg .bb-mkt-pillar-body { font-size: 1.02rem; }

/* ════════════════════════════════════════════════════════════════
   BEFORE / AFTER — signature visual moment
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-vs {
  position: relative;
  background: #1F2419;
  color: #F4EFE5;
  padding: 5rem 1.5rem 6rem;
  overflow: hidden;
  isolation: isolate;
}
.bb-mkt-vs::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0; right: 0;
  height: 36px;
  background: var(--color-paper);
  clip-path: polygon(0 0, 100% 0, 100% 0, 0 100%);
  z-index: 1;
}
.bb-mkt-vs::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("${TOPO}");
  background-repeat: repeat;
  opacity: 0.35;
  z-index: 0;
}
@media (min-width: 768px) { .bb-mkt-vs { padding: 7rem 2rem 8rem; } }

.bb-mkt-vs-head {
  position: relative;
  z-index: 2;
  margin: 0 0 3rem;
  max-width: 56rem;
}

.bb-mkt-vs-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  align-items: stretch;
}
@media (min-width: 900px) {
  .bb-mkt-vs-grid {
    grid-template-columns: 1fr 1fr;
    gap: 2.5rem;
    align-items: center;
  }
}

.bb-mkt-vs-card {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.bb-mkt-vs-tag {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  align-self: flex-start;
}
.bb-mkt-vs-tag-old {
  background: rgba(244, 239, 229, 0.08);
  color: rgba(244, 239, 229, 0.55);
  border: 1px solid rgba(244, 239, 229, 0.12);
}
.bb-mkt-vs-tag-new {
  background: linear-gradient(135deg, var(--color-copper), #8C5530);
  color: #FFFFFF;
  box-shadow: 0 8px 24px rgba(176, 108, 60, 0.45);
}

.bb-mkt-vs-paper {
  background: #f0e6cf;
  background-image:
    repeating-linear-gradient(180deg, transparent 0, transparent 27px, rgba(60, 50, 35, 0.15) 27px, rgba(60, 50, 35, 0.15) 28px),
    radial-gradient(ellipse at 30% 30%, rgba(120, 80, 30, 0.12), transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(100, 60, 20, 0.18), transparent 60%);
  color: #2A2017;
  padding: 1.4rem 1.4rem 1.6rem;
  border-radius: 4px;
  font-family: var(--font-barlow);
  box-shadow: 0 18px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(120, 80, 30, 0.18);
  transform: rotate(-1.2deg);
  position: relative;
}
.bb-mkt-vs-paper::before {
  content: '';
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%) rotate(-3deg);
  width: 70px;
  height: 22px;
  background: rgba(184, 132, 88, 0.55);
  border-radius: 2px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.25);
}
.bb-mkt-vs-paper-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #4A3622;
  margin: 0 0 1rem;
  border-bottom: 1px solid rgba(74, 54, 34, 0.25);
  padding-bottom: 0.45rem;
}
.bb-mkt-vs-paper-date { font-weight: 600; letter-spacing: 0.08em; }
.bb-mkt-vs-paper-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  font-size: 0.95rem;
  color: #2A2017;
}
.bb-mkt-vs-paper-list li {
  display: block;
  line-height: 1.45;
}
.bb-mkt-vs-strike {
  text-decoration: line-through;
  text-decoration-color: rgba(140, 60, 30, 0.65);
  text-decoration-thickness: 2px;
  color: rgba(74, 54, 34, 0.55);
  margin-right: 0.35rem;
}
.bb-mkt-vs-mute {
  color: rgba(74, 54, 34, 0.6);
  font-style: normal;
  font-weight: 500;
}
.bb-mkt-vs-paper-foot {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(140, 60, 30, 0.85);
  margin: 1rem 0 0;
  border-top: 1px dashed rgba(74, 54, 34, 0.4);
  padding-top: 0.55rem;
}

.bb-mkt-vs-screen {
  background: #0E0B08;
  border-radius: 22px;
  padding: 1.1rem 1.1rem 1.3rem;
  border: 1px solid rgba(244, 239, 229, 0.1);
  box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(176,108,60,0.18);
  transform: rotate(1deg);
  position: relative;
}
.bb-mkt-vs-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(244,239,229,0.06), transparent 30%);
  pointer-events: none;
}
.bb-mkt-vs-screen-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(244, 239, 229, 0.08);
}
.bb-mkt-vs-screen-dot {
  display: inline-block;
  width: 8px; height: 8px; border-radius: 999px;
  background: var(--color-copper);
  box-shadow: 0 0 0 3px rgba(176, 108, 60, 0.18);
}
.bb-mkt-vs-screen-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(244, 239, 229, 0.8);
}
.bb-mkt-vs-screen-body {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.25rem;
}
.bb-mkt-vs-screen-row {
  display: grid;
  grid-template-columns: 5.2rem 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.6rem 0.4rem;
  border-bottom: 1px solid rgba(244, 239, 229, 0.06);
}
.bb-mkt-vs-screen-row:last-child { border-bottom: 0; }
.bb-mkt-vs-screen-row-label {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(244, 239, 229, 0.5);
}
.bb-mkt-vs-screen-row-value {
  font-family: var(--font-barlow);
  font-size: 0.95rem;
  color: #F4EFE5;
  font-weight: 600;
}
.bb-mkt-vs-screen-row-check { color: #6A9859; }
.bb-mkt-vs-screen-cta {
  margin-top: 0.85rem;
  padding: 0.4rem;
}
.bb-mkt-vs-screen-cta-pill {
  display: block;
  background: var(--color-copper);
  color: #FFFFFF;
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-align: center;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(176, 108, 60, 0.4);
}

.bb-mkt-vs-caption {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  line-height: 1.5;
  color: rgba(244, 239, 229, 0.65);
  margin: 0.6rem 0 0;
  max-width: 28rem;
}

.bb-mkt-vs-foot {
  position: relative;
  z-index: 2;
  text-align: center;
  margin: 3.5rem auto 0;
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: 0.005em;
  color: #FFFFFF;
}

/* ════════════════════════════════════════════════════════════════
   STEPS — How it works
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-steps-wrap {
  background: var(--color-paper);
  color: var(--color-ink);
  padding: 5rem 1.5rem;
}
@media (min-width: 768px) { .bb-mkt-steps-wrap { padding: 7rem 2rem; } }
.bb-mkt-steps {
  list-style: none;
  padding: 0;
  margin: 2.5rem 0 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}
@media (min-width: 900px) {
  .bb-mkt-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
}
.bb-mkt-step {
  position: relative;
  padding: 1.5rem 1.5rem 1.75rem;
  background: #FFFFFF;
  border: 1px solid var(--color-card-divider);
  border-radius: 18px;
}
@media (min-width: 900px) {
  .bb-mkt-step {
    border-radius: 0;
    padding: 2.5rem 2rem;
    border-right: 0;
  }
  .bb-mkt-step:first-child { border-radius: 18px 0 0 18px; }
  .bb-mkt-step:last-child { border-radius: 0 18px 18px 0; border-right: 1px solid var(--color-card-divider); }
}
.bb-mkt-step-num {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 2.5rem;
  line-height: 1;
  color: var(--color-copper);
  display: block;
  margin-bottom: 0.85rem;
  letter-spacing: -0.005em;
}
.bb-mkt-step-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.6rem;
  line-height: 1.1;
  margin: 0 0 0.45rem;
  color: var(--color-ink);
}
.bb-mkt-step-body {
  font-family: var(--font-barlow);
  font-size: 0.97rem;
  line-height: 1.55;
  color: var(--color-ink-muted);
  margin: 0;
}
.bb-mkt-step-connector {
  display: none;
}
@media (min-width: 900px) {
  .bb-mkt-step-connector {
    display: block;
    position: absolute;
    top: 3.5rem;
    left: -1px;
    width: 1px;
    height: calc(100% - 7rem);
    background: var(--color-card-divider);
  }
  .bb-mkt-step-connector::before {
    content: '';
    position: absolute;
    top: -8px;
    left: -3px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--color-copper);
  }
}

/* ════════════════════════════════════════════════════════════════
   PRICING — confident statement
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-pricing-wrap {
  position: relative;
  background: var(--color-page-bg);
  color: #F4EFE5;
  padding: 6rem 1.5rem;
  overflow: hidden;
  isolation: isolate;
}
.bb-mkt-pricing-wrap::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("${TOPO}");
  background-repeat: repeat;
  opacity: 0.4;
  z-index: 0;
}
.bb-mkt-pricing-wrap > .bb-mkt-container {
  position: relative;
  z-index: 1;
}
@media (min-width: 768px) { .bb-mkt-pricing-wrap { padding: 8rem 2rem; } }

/* v27.9.2 — anchor the pricing block to the center of the page on
   desktop. Pre-v27.9.2 every child of the pricing container hugged
   left, leaving ~900px of dead space on the right at 1440px+. The
   children-collapsed rule centers the inner blocks (headline, toggle,
   bullet list, CTA, helper) and caps them at a readable width so the
   block reads as one anchored unit instead of a left rail. */
@media (min-width: 1024px) {
  .bb-mkt-pricing-wrap > .bb-mkt-container {
    text-align: center;
  }
  .bb-mkt-pricing-wrap .bb-mkt-section-eyebrow,
  .bb-mkt-pricing-wrap .bb-mkt-section-eyebrow-dark {
    justify-content: center;
  }
  .bb-mkt-pricing-headline-static,
  .bb-mkt-pricing-statement,
  .bb-mkt-pricing-list,
  .bb-mkt-pricing-cta-row {
    margin-left: auto;
    margin-right: auto;
  }
  .bb-mkt-pricing-list { max-width: 44rem; }
  .bb-mkt-pricing-cta-row { justify-content: center; }
  .bb-mkt-pricing-list li { justify-self: center; }
}

.bb-mkt-pricing-headline-static {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(2.4rem, 6vw, 3.8rem);
  line-height: 1.05;
  letter-spacing: -0.005em;
  color: #FFFFFF;
  margin: 0 0 2rem;
  max-width: 36rem;
}

.bb-mkt-pricing-headline {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.6rem 1.5rem;
  margin: 0;
  color: #FFFFFF;
  line-height: 0.95;
  letter-spacing: -0.015em;
}

/* ════════════════════════════════════════════════════════════════
   PRODUCT GALLERY (v27.8.0-preview6) — 3 art-directed product shots
   ════════════════════════════════════════════════════════════════
   Sits between How it works and Features. Dark surface so the photos
   pop; copper eyebrow + tight title under each. Stacks 1-col on mobile
   for full impact, 3-up at desktop. */
.bb-mkt-gallery-wrap {
  background: var(--color-page-bg, #0B0806);
  color: #FFFFFF;
  padding: 4rem 1.5rem 5rem;
  position: relative;
}
@media (min-width: 768px) {
  .bb-mkt-gallery-wrap { padding: 6rem 2rem 7rem; }
}
.bb-mkt-gallery {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
@media (min-width: 768px) {
  .bb-mkt-gallery { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
}
.bb-mkt-gallery-item {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.bb-mkt-gallery-img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: 0.75rem;
  background: #1A1410;
  box-shadow: 0 10px 40px -12px rgba(0, 0, 0, 0.5),
              0 2px 8px -2px rgba(0, 0, 0, 0.4);
  transition: transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1),
              box-shadow 240ms ease;
}
.bb-mkt-gallery-item:hover .bb-mkt-gallery-img {
  transform: translateY(-3px);
  box-shadow: 0 18px 60px -16px rgba(176, 108, 60, 0.35),
              0 4px 16px -4px rgba(0, 0, 0, 0.5);
}
.bb-mkt-gallery-cap {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0 0.15rem;
}
.bb-mkt-gallery-eyebrow {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-copper);
}
.bb-mkt-gallery-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.4rem;
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: #FFFFFF;
}

/* ════════════════════════════════════════════════════════════════
   FEATURES — what's actually in the app (8 cards, 4-col)
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-features-wrap {
  background: var(--color-paper);
  color: var(--color-ink);
  padding: 5rem 1.5rem;
}
@media (min-width: 768px) { .bb-mkt-features-wrap { padding: 7rem 2rem; } }
.bb-mkt-features {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.9rem;
  margin-top: 2rem;
}
@media (min-width: 640px) {
  .bb-mkt-features { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
}
@media (min-width: 1024px) {
  .bb-mkt-features { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.1rem; }
}
.bb-mkt-feature-card {
  background: #FFFFFF;
  border: 1px solid var(--color-card-divider);
  border-radius: 14px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: border-color 220ms, transform 220ms, box-shadow 220ms;
}
.bb-mkt-feature-card:hover {
  border-color: rgba(176, 108, 60, 0.45);
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(11, 8, 6, 0.06);
}
.bb-mkt-feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--color-copper), #8C5530);
  color: #FFFFFF;
  margin-bottom: 0.4rem;
  box-shadow: 0 4px 10px rgba(176, 108, 60, 0.3);
}
.bb-mkt-feature-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.1rem;
  line-height: 1.15;
  margin: 0;
  color: var(--color-ink);
}
.bb-mkt-feature-body {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  line-height: 1.5;
  color: var(--color-ink-muted);
  margin: 0;
}

/* ════════════════════════════════════════════════════════════════
   PRICING TOGGLE
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-price-toggle-row {
  display: inline-flex;
  background: rgba(244, 239, 229, 0.08);
  border: 1px solid rgba(244, 239, 229, 0.12);
  padding: 0.3rem;
  border-radius: 999px;
  margin: 0 0 1.5rem;
}
.bb-mkt-price-toggle-btn {
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(244, 239, 229, 0.65);
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: background 200ms, color 200ms;
}
.bb-mkt-price-toggle-btn:hover { color: #FFFFFF; }
.bb-mkt-price-toggle-btn.is-active {
  background: var(--color-copper);
  color: #FFFFFF;
  box-shadow: 0 6px 16px rgba(176, 108, 60, 0.4);
}
.bb-mkt-price-save-pill {
  display: inline-flex;
  align-items: center;
  background: rgba(106, 152, 89, 0.22);
  color: #BFE0A8;
  border: 1px solid rgba(106, 152, 89, 0.4);
  border-radius: 999px;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  padding: 0.15rem 0.45rem;
  margin-left: 0.35rem;
}
.bb-mkt-price-toggle-btn.is-active .bb-mkt-price-save-pill {
  background: rgba(255, 255, 255, 0.18);
  color: #FFFFFF;
  border-color: rgba(255, 255, 255, 0.35);
}

.bb-mkt-price-amount-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin: 0 0 0.4rem;
}
.bb-mkt-price-amount-big {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(4.5rem, 14vw, 8.5rem);
  line-height: 1;
  color: var(--color-copper);
  letter-spacing: -0.015em;
}
.bb-mkt-price-amount-period {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: clamp(2rem, 5vw, 3.2rem);
  color: rgba(244, 239, 229, 0.85);
  line-height: 1;
}
.bb-mkt-price-equiv {
  font-family: var(--font-barlow);
  font-size: 0.95rem;
  color: rgba(244, 239, 229, 0.65);
  margin: 0 0 1rem;
}
.bb-mkt-pricing-amount {
  font-size: clamp(5rem, 18vw, 11rem);
  color: var(--color-copper);
}
.bb-mkt-pricing-period {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  color: rgba(244, 239, 229, 0.85);
}
.bb-mkt-pricing-statement {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: clamp(1.4rem, 3vw, 2rem);
  line-height: 1.15;
  margin: 0.85rem 0 0;
  color: rgba(244, 239, 229, 0.85);
  max-width: 36rem;
}
.bb-mkt-pricing-accent { color: var(--color-copper); }

.bb-mkt-pricing-list {
  list-style: none;
  padding: 0;
  margin: 2.5rem 0 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem 1.5rem;
  max-width: 56rem;
}
@media (min-width: 640px) { .bb-mkt-pricing-list { grid-template-columns: 1fr 1fr; } }
.bb-mkt-pricing-list li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-barlow);
  font-size: 1rem;
  color: rgba(244, 239, 229, 0.85);
}
.bb-mkt-pricing-list li svg { color: var(--color-copper); flex-shrink: 0; }

.bb-mkt-pricing-cta-row {
  margin: 2.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}
.bb-mkt-pricing-fineprint {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  color: rgba(244, 239, 229, 0.55);
  margin: 0;
  max-width: 26rem;
}
.bb-mkt-pricing-fineprint strong { color: #F4EFE5; font-weight: 600; }

/* ════════════════════════════════════════════════════════════════
   FAQ
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-faq-wrap {
  background: var(--color-paper);
  color: var(--color-ink);
  padding: 5rem 1.5rem;
}
@media (min-width: 768px) { .bb-mkt-faq-wrap { padding: 7rem 2rem; } }
.bb-mkt-faq {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.bb-mkt-faq-item {
  background: #FFFFFF;
  border: 1px solid var(--color-card-divider);
  border-radius: 14px;
  padding: 0;
  overflow: hidden;
  transition: border-color 200ms;
}
.bb-mkt-faq-item[open] { border-color: rgba(176, 108, 60, 0.5); }
.bb-mkt-faq-item summary {
  padding: 1.1rem 1.4rem;
  cursor: pointer;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--color-ink);
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  letter-spacing: 0.005em;
}
.bb-mkt-faq-item summary::-webkit-details-marker { display: none; }
.bb-mkt-faq-item summary::after {
  content: '+';
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1.7rem;
  color: var(--color-copper);
  line-height: 1;
}
.bb-mkt-faq-item[open] summary::after { content: '−'; }
.bb-mkt-faq-body {
  padding: 0 1.4rem 1.15rem;
  font-family: var(--font-barlow);
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-ink-muted);
}
.bb-mkt-faq-foot {
  margin: 2rem 0 0;
  font-family: var(--font-barlow);
  font-size: 0.95rem;
  color: var(--color-ink-soft);
  text-align: left;
}
.bb-mkt-inline-link { color: var(--color-copper); text-decoration: underline; font-weight: 600; }

/* ════════════════════════════════════════════════════════════════
   FINAL CTA — cinematic dark close
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-final {
  position: relative;
  background: #0B0806;
  color: #F4EFE5;
  padding: 6rem 1.5rem 7rem;
  overflow: hidden;
  isolation: isolate;
}
.bb-mkt-final-topo {
  position: absolute; inset: 0;
  background-image: url("${TOPO}");
  background-repeat: repeat;
  opacity: 0.45;
  z-index: 0;
}
@media (min-width: 768px) { .bb-mkt-final { padding: 8rem 2rem 9rem; } }
.bb-mkt-final > .bb-mkt-container { position: relative; z-index: 1; }

.bb-mkt-final-title {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: clamp(2.4rem, 7vw, 5rem);
  line-height: 0.98;
  letter-spacing: -0.005em;
  margin: 0.85rem 0 1.5rem;
  color: #FFFFFF;
}
.bb-mkt-final-accent { color: var(--color-copper); }
.bb-mkt-final-sub {
  font-family: var(--font-barlow);
  font-size: 1.1rem;
  color: rgba(244, 239, 229, 0.78);
  margin: 0 0 2.25rem;
  max-width: 36rem;
}
.bb-mkt-final-cta { box-shadow: 0 20px 48px rgba(176, 108, 60, 0.5); }
.bb-mkt-final-fineprint {
  margin: 1.25rem 0 0;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(244, 239, 229, 0.55);
}

/* ════════════════════════════════════════════════════════════════
   FOOTER
   ════════════════════════════════════════════════════════════════ */
.bb-mkt-footer {
  background: #07050a;
  color: rgba(244, 239, 229, 0.78);
  padding: 4rem 1.5rem 1.5rem;
  border-top: 1px solid rgba(176, 108, 60, 0.18);
}
@media (min-width: 768px) { .bb-mkt-footer { padding: 5rem 2rem 1.75rem; } }
.bb-mkt-footer-inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
}
@media (min-width: 768px) {
  .bb-mkt-footer-inner { grid-template-columns: 1.2fr 2fr; gap: 3.5rem; }
}
.bb-mkt-footer-brand { display: flex; flex-direction: column; gap: 0.85rem; }
.bb-mkt-footer-brand-row { display: flex; align-items: center; gap: 0.7rem; }
.bb-mkt-footer-mark { width: 36px; height: 36px; }
.bb-mkt-footer-brand-text {
  font-family: var(--font-barlow-condensed);
  font-weight: 800;
  font-size: 1rem;
  letter-spacing: 0.16em;
  color: #FFFFFF;
  text-transform: uppercase;
}
.bb-mkt-footer-tag {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  color: rgba(244, 239, 229, 0.55);
  margin: 0;
  max-width: 24rem;
  line-height: 1.55;
}
.bb-mkt-footer-support {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  color: var(--color-copper);
  text-decoration: none;
  border-bottom: 1px solid rgba(176, 108, 60, 0.4);
  padding-bottom: 0.1rem;
  align-self: flex-start;
}
.bb-mkt-footer-support:hover { color: #FFFFFF; border-bottom-color: #FFFFFF; }

.bb-mkt-footer-cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
}
@media (max-width: 480px) {
  .bb-mkt-footer-cols { grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .bb-mkt-footer-cols > :nth-child(3) { grid-column: span 2; }
}
.bb-mkt-footer-col-heading {
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(244, 239, 229, 0.45);
  margin: 0 0 0.85rem;
}
.bb-mkt-footer-col-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.bb-mkt-footer-col-list a {
  font-family: var(--font-barlow);
  font-size: 0.92rem;
  color: rgba(244, 239, 229, 0.78);
  text-decoration: none;
}
.bb-mkt-footer-col-list a:hover { color: #FFFFFF; }
.bb-mkt-footer-bottom {
  margin-top: 2.75rem;
  padding-top: 1.4rem;
  border-top: 1px solid rgba(244, 239, 229, 0.08);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem 0.8rem;
  font-family: var(--font-barlow-condensed);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(244, 239, 229, 0.4);
  text-align: center;
}
.bb-mkt-footer-bottom-divider { color: var(--color-copper); }

/* ════════════════════════════════════════════════════════════════
   v27.9.7 — DESKTOP REDESIGN
   ════════════════════════════════════════════════════════════════
   Mobile is locked. All rules below are guarded by min-width: 1024px
   (sm-desktop) or 1280px+ (wide). They reconsider layout, scale, and
   composition for screens that have room — not stretch mobile out.

   Sections touched:
   - HERO: bigger title, content column constrained so phone backdrop
     reads through on the right; stat row pulled into its own credentials
     band so it doesn't get clipped by the phone image.
   - DIVIDERS: copper hairline + topo-fade bands between dark/paper
     sections so the rhythm feels intentional.
   - PILLARS: asymmetric — featured pillar 01 spans 2 rows on the left,
     pillars 02/03/04 stack as 3 satellites on the right. Real visual
     hierarchy that mobile can't pull off.
   - PILLAR VISUAL TREATMENT: gradient ink-tone backgrounds, copper
     top accent stroke, larger numerals, deeper hover lift.
   - HOW IT WORKS: bigger numerals + tighter rhythm.
   - PRICING: wrapped in an anchored card with copper top stroke, ink
     gradient, dropshadow. $90 reads as the centerpiece, not a footnote.
   - FINAL CTA: centered, bigger, with breathing room.
   - FOOTER: 4-column layout with brand column on left + 3 link columns,
     credit row at bottom. */

/* v27.9.7.1 — pull-back. v27.9.7 went too aggressive on type +
   spacing: words landed on their own rows and sections ran to 1000px+
   tall. Headlines pulled down (hero 10rem → 6.5rem cap; final 8rem →
   5.5rem; pricing $90 11rem → 7.5rem). Section paddings cut ~30%.
   Big headlines get text-wrap: balance + hyphens: none + line-height
   1.0 so they don't tower vertically or break weird. */

@media (min-width: 1024px) {
  /* HERO — content column constrained so the phone backdrop owns the
     right. Title scale moderate (was overshooting at 10rem cap). Stat
     row stays in the left column instead of stretching across the
     full width onto the phone image.

     v27.9.7.2 — kill the towering hero. The 768+ rule sets the outer
     .bb-mkt-hero to min-height: 96vh (1037px on 1080p) and the inner
     stack to min-height clamp(640, 84vh, 880px). At desktop the hero
     was eating the entire fold and pushing every other section
     below. At 1024+ both come down: outer caps at clamp(440, 60vh,
     620px) so on 1080p the hero is ~620px (next section's eyebrow
     becomes visible above the fold), and the stack clamp matches so
     content drives height. */
  .bb-mkt-hero {
    min-height: clamp(440px, 60vh, 620px);
  }
  .bb-mkt-hero-stack {
    max-width: 1280px;
    padding: 3rem 3rem 2.5rem;
    min-height: clamp(440px, 58vh, 600px);
    gap: 0.85rem;
  }
  .bb-mkt-hero-eyebrow,
  .bb-mkt-hero-title,
  .bb-mkt-hero-sub,
  .bb-mkt-hero-cta-row,
  .bb-mkt-hero-stat-row {
    max-width: 56%;
  }
  .bb-mkt-hero-title {
    font-size: clamp(3rem, 4.8vw, 5rem);
    letter-spacing: -0.012em;
    line-height: 1;
    text-wrap: balance;
    hyphens: none;
  }
  .bb-mkt-hero-stat-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.2rem;
    padding-top: 1.1rem;
    margin-top: 1.1rem;
  }
  .bb-mkt-hero-stat-row strong { font-size: 1.95rem; }
  .bb-mkt-hero-stat-row span { font-size: 0.74rem; }

  /* SECTION DIVIDER — copper hairline + soft topo wash to give the
     transition between dark and paper sections a real edge instead
     of a hard color flip. */
  .bb-mkt-pillars-wrap,
  .bb-mkt-features-wrap,
  .bb-mkt-faq-wrap {
    position: relative;
  }
  .bb-mkt-pillars-wrap::before,
  .bb-mkt-features-wrap::before,
  .bb-mkt-faq-wrap::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 3.5rem;
    height: 3px;
    background: var(--color-copper);
    border-radius: 999px;
  }

  /* SECTION PADDING — v27.9.7.3 second pull. Was 5rem at 1024+ which
     still felt bloated. Now 3.5rem on most sections so they read as
     one unit instead of slow vertical reveals. Mobile untouched. */
  .bb-mkt-pillars-wrap { padding: 3.5rem 2rem; }
  .bb-mkt-features-wrap { padding: 3.5rem 2rem; }
  .bb-mkt-faq-wrap { padding: 3.5rem 2rem; }
  .bb-mkt-pricing-wrap { padding: 3.5rem 2rem; }
  .bb-mkt-final { padding: 4rem 2rem 4.5rem; }
  .bb-mkt-manifesto { padding: 3rem 2rem; }
  .bb-mkt-gallery-wrap { padding: 3rem 2rem 3.5rem; }
  .bb-mkt-steps-wrap { padding: 3.5rem 2rem; }

  /* SECTION HEADER SPACING — pull the gap between heading block and
     content grid from the 3rem default down to 1.5rem so each section
     starts producing content sooner. */
  .bb-mkt-pillars-head { margin: 0 0 1.5rem; }
  .bb-mkt-section-eyebrow { margin: 0 0 0.5rem; }
  .bb-mkt-section-title { margin: 0 0 0.6rem; }
  .bb-mkt-features .bb-mkt-section-title,
  .bb-mkt-features-wrap .bb-mkt-section-sub { margin-bottom: 0.6rem; }
  .bb-mkt-features { margin-top: 1.4rem; }
  .bb-mkt-faq-foot { margin: 1.25rem 0 0; }

  /* HEADLINE WRAP — balance + no hyphens + tighter line-height so big
     headlines don't break weirdly or tower vertically. */
  .bb-mkt-section-title,
  .bb-mkt-pricing-headline-static,
  .bb-mkt-final-title,
  .bb-mkt-manifesto-text {
    text-wrap: balance;
    hyphens: none;
    line-height: 1.02;
  }

  /* PILLARS — asymmetric featured layout. Pillar 01 (bb-mkt-pillar-lg)
     anchors the left column; 02/03/04 stack as 3 satellites on the
     right. v27.9.7.1: align-self: start on pillar-lg so it sits at
     natural height instead of stretching to match the satellite stack.
     Satellite cards tighter + smaller pillar-lg padding/icon/title to
     prevent towering. */
  .bb-mkt-pillars {
    grid-template-columns: 1.2fr 1fr;
    grid-template-rows: auto;
    gap: 1.1rem;
    align-items: start;
  }
  .bb-mkt-pillar-lg {
    grid-column: 1;
    grid-row: 1 / span 3;
    align-self: start;
    padding: 2.4rem 2.2rem 2.2rem;
    background: linear-gradient(160deg, #FFFFFF 0%, #F8F1E5 100%);
    border-color: rgba(176, 108, 60, 0.22);
    box-shadow: 0 24px 60px rgba(11, 8, 6, 0.06);
    position: relative;
    overflow: hidden;
  }
  .bb-mkt-pillar-lg::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, var(--color-copper), rgba(176, 108, 60, 0));
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-icon {
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 18px;
    margin-bottom: 0.7rem;
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-num {
    font-size: 0.88rem;
    letter-spacing: 0.24em;
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-title {
    font-size: clamp(1.7rem, 2vw, 2.2rem);
    margin-top: 0.3rem;
    line-height: 1.08;
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-body {
    font-size: 1rem;
    line-height: 1.55;
    max-width: 28rem;
  }
  .bb-mkt-pillars > .bb-mkt-pillar:not(.bb-mkt-pillar-lg) {
    padding: 1.1rem 1.25rem 1.15rem;
    background: #FFFFFF;
  }
  .bb-mkt-pillars > .bb-mkt-pillar:not(.bb-mkt-pillar-lg)::before {
    content: '';
    position: absolute;
    top: 0;
    left: 1.6rem;
    width: 2.2rem;
    height: 3px;
    background: var(--color-copper);
    border-radius: 999px;
  }
  .bb-mkt-pillars > .bb-mkt-pillar:not(.bb-mkt-pillar-lg) .bb-mkt-pillar-icon {
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 12px;
    margin-bottom: 0.5rem;
  }
  .bb-mkt-pillars > .bb-mkt-pillar:not(.bb-mkt-pillar-lg) .bb-mkt-pillar-title {
    font-size: 1.32rem;
  }
  .bb-mkt-pillars > .bb-mkt-pillar:hover {
    transform: translateY(-4px);
    box-shadow: 0 28px 56px rgba(11, 8, 6, 0.1);
  }

  /* HOW IT WORKS — modest numeral bump + tighter step copy. v27.9.7.1
     pulled padding + title back from v27.9.7's overshoot. */
  .bb-mkt-step { padding: 2rem 1.6rem 1.85rem; }
  .bb-mkt-step-num {
    font-size: 2.6rem;
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .bb-mkt-step-title { font-size: 1.32rem; }
  .bb-mkt-step-body { font-size: 1rem; line-height: 1.55; }

  /* PRICING — anchored card. v27.9.7.3: tightened to 2.25rem 2.5rem
     2.25rem so the whole card fits within ~600-650px tall. */
  .bb-mkt-pricing-wrap > .bb-mkt-container {
    text-align: center;
    max-width: 1080px;
    background: linear-gradient(165deg, rgba(31, 36, 25, 0.55) 0%, rgba(11, 8, 6, 0.65) 100%);
    border: 1px solid rgba(176, 108, 60, 0.26);
    border-radius: 24px;
    padding: 2.25rem 2.5rem 2.25rem;
    position: relative;
    box-shadow: 0 32px 70px rgba(0, 0, 0, 0.32);
    overflow: hidden;
  }
  .bb-mkt-pricing-wrap > .bb-mkt-container::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, rgba(176, 108, 60, 0), var(--color-copper) 50%, rgba(176, 108, 60, 0));
  }
  .bb-mkt-pricing-headline-static {
    font-size: clamp(1.85rem, 2.4vw, 2.25rem);
    max-width: 32rem;
    margin: 0 auto 0.85rem;
  }
  .bb-mkt-price-toggle-row { margin: 0 auto 0.85rem; }
  .bb-mkt-price-amount-row {
    justify-content: center;
    gap: 0.5rem 1.1rem;
    margin: 0;
  }
  .bb-mkt-price-amount-big {
    font-size: clamp(3.6rem, 6vw, 5.5rem);
    line-height: 1;
    text-shadow: 0 6px 20px rgba(176, 108, 60, 0.18);
  }
  .bb-mkt-price-amount-period {
    font-size: clamp(1.5rem, 2.2vw, 2rem);
    line-height: 1;
  }
  .bb-mkt-price-equiv { text-align: center; margin: 0.3rem 0 0.6rem; }
  .bb-mkt-pricing-statement { margin: 0.25rem auto 0; font-size: 1.1rem; }
  .bb-mkt-pricing-list {
    margin: 1.1rem auto 0;
    grid-template-columns: 1fr 1fr 1fr;
    column-gap: 1.5rem;
    row-gap: 0.55rem;
    max-width: 56rem;
  }
  .bb-mkt-pricing-list li { justify-self: start; font-size: 0.92rem; }
  .bb-mkt-pricing-cta-row {
    margin-top: 1.1rem;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
  }
  .bb-mkt-pricing-fineprint { text-align: center; margin: 0; }

  /* FINAL CTA — center on desktop. v27.9.7.1: title clamp dropped from
     7rem cap to 4.5rem cap; padding pulled. */
  .bb-mkt-final > .bb-mkt-container {
    text-align: center;
  }
  .bb-mkt-final .bb-mkt-section-eyebrow,
  .bb-mkt-final .bb-mkt-section-eyebrow-dark {
    justify-content: center;
  }
  .bb-mkt-final-title {
    font-size: clamp(3rem, 4.5vw, 4.5rem);
    max-width: none;
    margin: 0.85rem auto 1.25rem;
  }
  .bb-mkt-final-sub {
    margin: 0 auto 1.5rem;
    font-size: 1.1rem;
    max-width: 32rem;
  }
  .bb-mkt-final-fineprint { text-align: center; }

  /* FOOTER — 4-col layout. Brand block keeps left column; 3 link cols
     fan out across the rest of the row. */
  .bb-mkt-footer-inner {
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
    gap: 4rem;
    align-items: start;
  }
  .bb-mkt-footer-cols {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 2.5rem;
    grid-column: span 3;
  }
}

/* WIDE — 1280+ tier. v27.9.7.1: was overshooting at the previous
   caps (hero 11rem, final 8rem, manifesto 6rem). Modest bump only —
   the page should feel confident on a wide shell, not ransom-note. */
@media (min-width: 1280px) {
  .bb-mkt-hero-title {
    font-size: clamp(4rem, 6.5vw, 7rem);
  }
  .bb-mkt-hero-sub {
    font-size: 1.18rem;
    max-width: 38rem;
  }
  .bb-mkt-hero-stat-row strong { font-size: 2.15rem; }

  .bb-mkt-section-title {
    font-size: clamp(2.4rem, 3.5vw, 3.8rem);
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-title {
    font-size: clamp(1.85rem, 2.2vw, 2.4rem);
  }
  .bb-mkt-pillar-lg .bb-mkt-pillar-body {
    font-size: 1.05rem;
  }

  .bb-mkt-final-title {
    font-size: clamp(3.5rem, 5.5vw, 5.5rem);
  }

  .bb-mkt-manifesto-text {
    font-size: clamp(2.4rem, 4vw, 4rem);
  }
}

/* ULTRA-WIDE — 1600+ tier. Constrain content lengths so lines stay
   readable at 1920+ instead of stretching corner-to-corner. */
@media (min-width: 1600px) {
  .bb-mkt-container { max-width: 1320px; }
  .bb-mkt-hero-stack { max-width: 1440px; padding: 7rem 4rem 5rem; }
}
`
