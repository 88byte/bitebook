// v27.9.5b — Help Center category registry. Locked at the 10
// categories Flavio approved in the v27.9.5 plan. Audience drives
// which categories appear in the guide vs hunter views.
//
// Routes:
//   /app/support             (guide landing — sees all + 'both')
//   /app/h/support           (hunter landing — sees 'hunter' + 'both')
//   /app/support/[slug]      (guide article)
//   /app/h/support/[slug]    (hunter article — 404 if guide-only)
//
// Article files live at src/content/help/{category-slug}/{article-slug}.mdx

export type HelpAudience = 'guide' | 'hunter' | 'both'

export interface HelpCategory {
  slug: string
  title: string
  audience: HelpAudience
  description: string
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: 'getting-started-guides',
    title: 'Getting started',
    audience: 'guide',
    description: 'Set up your account, your profile, and your first trip.',
  },
  {
    slug: 'getting-started-hunters',
    title: 'Getting started',
    audience: 'hunter',
    description: 'Accept your guide’s invite and get ready for trip day.',
  },
  {
    slug: 'trips',
    title: 'Managing trips',
    audience: 'guide',
    description: 'Create, edit, and wrap up trips. Add or remove hunters.',
  },
  {
    slug: 'hunters-invites',
    title: 'Hunters & invites',
    audience: 'guide',
    description: 'Email invites, share links, and what to do when an invite goes sideways.',
  },
  {
    slug: 'wallet',
    title: 'Wallet',
    audience: 'both',
    description: 'Licenses, tags, and permits. Add them, renew them, link them to a trip.',
  },
  {
    slug: 'hunt-logs',
    title: 'Hunt logs & state forms',
    audience: 'guide',
    description: 'Generate and e-sign your state’s harvest log.',
  },
  {
    slug: 'warden-share',
    title: 'Sharing with wardens',
    audience: 'guide',
    description: 'Show your trip in the field, online or off.',
  },
  {
    slug: 'billing',
    title: 'Billing & subscription',
    audience: 'guide',
    description: 'Trial, monthly vs annual, cancel and restart.',
  },
  {
    slug: 'account',
    title: 'Account, password, settings',
    audience: 'both',
    description: 'Email, password, default signature, and personal settings.',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    audience: 'both',
    description: 'When something’s not working the way you’d expect.',
  },
]

// Filter categories visible to a given audience. A guide sees their
// own categories plus 'both'; a hunter sees their own plus 'both'.
// 'both' is the only category type that crosses audiences.
export function categoriesForAudience(audience: 'guide' | 'hunter'): HelpCategory[] {
  return HELP_CATEGORIES.filter((c) => c.audience === audience || c.audience === 'both')
}

export function getCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug)
}
