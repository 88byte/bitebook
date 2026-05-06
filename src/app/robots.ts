import type { MetadataRoute } from 'next'

// v27.8.0 — Next.js metadata-route robots. Served at /robots.txt.
//
// /welcome is the canonical marketing surface and is allowed.
// /welcome-preview is a sandbox iteration target — disallow crawl so
// it doesn't compete with /welcome in search indexes.
// /app/* and /admin/* are private surfaces — disallow.
// /api/* is server-only — disallow.

const SITE = 'https://bitebook.lastbite.pro'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/welcome', '/login', '/signup'],
        disallow: ['/welcome-preview', '/app/', '/admin/', '/api/', '/accept-invite'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
