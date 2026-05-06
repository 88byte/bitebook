import type { MetadataRoute } from 'next'

// v27.8.0 — Next.js metadata-route sitemap. Served at /sitemap.xml.
//
// Only public, indexable surfaces are listed. /welcome is the
// canonical marketing page; / is the legacy root that already
// renders the same brand surface. /login + /signup are listed at
// lower priority because they're conversion endpoints rather than
// content destinations.

const SITE = 'https://bitebook.lastbite.pro'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${SITE}/welcome`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]
}
