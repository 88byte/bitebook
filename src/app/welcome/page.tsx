import type { Metadata } from 'next'
import WelcomePreviewPage from '../welcome-preview/page'

// v27.8.0 production cutover.
//
// /welcome is the canonical, indexed marketing page. /welcome-preview
// remains as a sandbox for in-progress iterations and stays
// noindex'd. Both routes render the SAME body — we import the
// default export from welcome-preview/page.tsx and re-export it here
// with production metadata. This avoids a 1800-line duplicate file
// and ensures any future visual change ships to both surfaces in
// lockstep, until we deliberately want to diverge for sandbox work.
//
// The metadata export below replaces welcome-preview's:
//   • robots flips from 'noindex, nofollow' to 'index, follow'
//   • alternates.canonical points at /welcome (was /welcome-preview)
//   • OG + Twitter share URLs point at /welcome
// All other tags (title, description, keywords, OG image, JSON-LD)
// are inherited via the imported component's <script> tags in body
// and the per-route Metadata export here.
//
// Future iteration plan: when this page diverges from welcome-preview,
// extract the body into a shared module under src/app/_components/
// rather than letting them silently fork.

export const metadata: Metadata = {
  title: 'Bite Book — Digital log book for hunting & fishing guides',
  description:
    "Paper logs are a tax on your time. Bite Book files your state's trip log from your phone. 7 days free. No card.",
  robots: 'index, follow',
  alternates: { canonical: 'https://bitebook.lastbite.pro/welcome' },
  openGraph: {
    type: 'website',
    title: 'Bite Book — Built for guides. Made for the field.',
    description:
      "Paper logs are a tax on your time. Bite Book files your state's trip log from your phone. 7 days free. No card.",
    url: 'https://bitebook.lastbite.pro/welcome',
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

export default function WelcomePage() {
  return <WelcomePreviewPage />
}
