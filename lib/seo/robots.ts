import type { MetadataRoute } from 'next';

/**
 * AI crawler user-agents we explicitly welcome (GEO intent). Mostly declarative
 * — the `*` rule already permits them — but it documents the policy and avoids
 * the opt-out defaults of Google-Extended / Applebot-Extended being misread.
 * Flip allow→disallow here to change the stance for all bots at once.
 */
export const AI_CRAWLER_USER_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
] as const;

const ALLOW = ['/', '/login', '/signup', '/password'];
const DISALLOW = [
  '/home',
  '/inbox',
  '/rfp',
  '/settings',
  '/api/',
  '/invite/',
  '/auth/',
  '/logout',
];

/** Host-aware robots: host + sitemap reference the serving origin. */
export function buildRobots(origin: string): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ALLOW, disallow: DISALLOW },
      { userAgent: [...AI_CRAWLER_USER_AGENTS], allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
