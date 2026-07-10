import type { MetadataRoute } from 'next';
import type { WorkspaceType } from '@/lib/types/workspace';

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
  '/rfp-create',
  '/opportunities',
  '/messages',
  '/notifications',
  '/quote-templates',
  '/workspace',
  '/settings',
  '/pending-approval',
  '/suspended',
  '/api/',
  '/invite/',
  '/auth/',
  '/logout',
];

/**
 * Host-aware robots: host + sitemap reference the serving origin. The partner
 * (pg) host is blocked outright — it's not meant to compete with the buyer
 * host for search visibility — so every crawler gets a blanket disallow with
 * no sitemap reference.
 */
export function buildRobots(origin: string, type: WorkspaceType = 'buyer'): MetadataRoute.Robots {
  if (type === 'pg') {
    return { rules: [{ userAgent: '*', disallow: ['/'] }] };
  }
  return {
    rules: [
      { userAgent: '*', allow: ALLOW, disallow: DISALLOW },
      { userAgent: [...AI_CRAWLER_USER_AGENTS], allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
