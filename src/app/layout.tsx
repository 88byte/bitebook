import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import InstallPrompt from '@/components/InstallPrompt'
import RecoveryHandler from '@/components/RecoveryHandler'

// Bump on each release that ships new static assets so installed PWAs
// know to refresh. Visible in the rendered HTML as <meta name="bb-build">
// for easy curl/view-source verification of which build a client is on.
const BUILD_TAG = 'v27.1.1.0.3e.6-trip-detail-merged-with-edit'

const barlow = Barlow({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  subsets: ['latin'],
  weight: ['700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Bite Book',
  description: 'The digital log book for hunting and fishing guides.',
  applicationName: 'Bite Book',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bite Book',
  },
  formatDetection: { telephone: false },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0806',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <head>
        <meta name="bb-build" content={BUILD_TAG} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <InstallPrompt />
        <RecoveryHandler />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
