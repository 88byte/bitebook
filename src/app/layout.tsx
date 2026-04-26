import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import InstallPrompt from '@/components/InstallPrompt'

const barlow = Barlow({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  subsets: ['latin'],
  weight: ['700'],
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
  themeColor: '#B45309',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <InstallPrompt />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
