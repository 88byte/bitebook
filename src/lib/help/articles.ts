import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { HelpAudience } from './categories'
import { HELP_CATEGORIES } from './categories'

// v27.9.5b — Help article loader. Reads MDX files at request time
// from src/content/help/{category}/{slug}.mdx. Articles are loaded
// per-call (not cached in memory) — Next bundles fs reads server-side
// and at production scale (32 articles, plain MDX) the cost is
// negligible. If the article count grows past ~200 we'll add
// build-time index generation.
//
// Each article ships with frontmatter:
//   ---
//   title: "How do I invite a hunter?"
//   slug: "invite-a-hunter"
//   category: "hunters-invites"
//   audience: "guide"           # guide | hunter | both
//   tags: ["invite", "email"]
//   last_updated: "2026-05-06"
//   related: ["multi-use-link"] # optional list of other slugs
//   ---

export interface HelpArticleMeta {
  slug: string
  title: string
  category: string
  audience: HelpAudience
  tags: string[]
  last_updated: string
  related: string[]
  // First paragraph of body, plain text. Used for search index +
  // landing-page card preview. Capped at ~240 chars.
  excerpt: string
}

export interface HelpArticle extends HelpArticleMeta {
  // Raw MDX body (frontmatter stripped). Compiled by next-mdx-remote
  // at the article-detail route.
  body: string
}

const HELP_ROOT = path.join(process.cwd(), 'src/content/help')

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function extractExcerpt(body: string): string {
  // Strip MDX/HTML/JSX-ish stuff to get a clean text excerpt for the
  // search index + card preview. First non-empty paragraph wins.
  const lines = body.split('\n')
  let para = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (para) break
      continue
    }
    // Skip headings, fences, JSX-only lines.
    if (/^#{1,6}\s/.test(line)) continue
    if (/^```/.test(line)) continue
    if (/^<[A-Z]/.test(line)) continue
    para = para ? `${para} ${line}` : line
  }
  // Strip basic markdown emphasis/links to plain text.
  const stripped = para
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .trim()
  return stripped.length > 240 ? `${stripped.slice(0, 237).trimEnd()}…` : stripped
}

function parseArticle(filePath: string): HelpArticle | null {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  const parsed = matter(raw)
  const fm = parsed.data as Partial<HelpArticleMeta>
  if (!fm.slug || !fm.title || !fm.category || !fm.audience) return null
  // Only accept categories we explicitly support, prevents typos
  // shipping orphaned articles.
  if (!HELP_CATEGORIES.some((c) => c.slug === fm.category)) return null
  return {
    slug: fm.slug,
    title: fm.title,
    category: fm.category,
    audience: fm.audience,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    last_updated: fm.last_updated ?? '',
    related: Array.isArray(fm.related) ? fm.related : [],
    excerpt: extractExcerpt(parsed.content),
    body: parsed.content,
  }
}

// Walk the help content tree once and return every article. Articles
// without a recognized category are ignored.
export function getAllArticles(): HelpArticle[] {
  const out: HelpArticle[] = []
  for (const category of readDirSafe(HELP_ROOT)) {
    const catPath = path.join(HELP_ROOT, category)
    if (!fs.statSync(catPath).isDirectory()) continue
    for (const file of readDirSafe(catPath)) {
      if (!file.endsWith('.mdx')) continue
      const article = parseArticle(path.join(catPath, file))
      if (article) out.push(article)
    }
  }
  // Newest-first by last_updated (string sort works for ISO dates).
  out.sort((a, b) => (b.last_updated || '').localeCompare(a.last_updated || ''))
  return out
}

// Filter articles to what a given audience is allowed to see. Hunter
// view excludes guide-only articles per Flavio's confirmed answer.
// Guide view excludes hunter-only since guides don't need them.
export function articlesForAudience(audience: 'guide' | 'hunter'): HelpArticle[] {
  return getAllArticles().filter((a) => a.audience === audience || a.audience === 'both')
}

export function getArticleBySlug(slug: string, audience: 'guide' | 'hunter'): HelpArticle | null {
  return articlesForAudience(audience).find((a) => a.slug === slug) ?? null
}

// Lightweight index for client-side search. Drops the body so we're
// only shipping ~150 bytes per article to the browser.
export interface HelpSearchEntry {
  slug: string
  title: string
  category: string
  excerpt: string
  tags: string[]
  href: string
}

export function buildSearchIndex(audience: 'guide' | 'hunter'): HelpSearchEntry[] {
  const base = audience === 'hunter' ? '/app/h/support' : '/app/support'
  return articlesForAudience(audience).map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    excerpt: a.excerpt,
    tags: a.tags,
    href: `${base}/${a.slug}`,
  }))
}
