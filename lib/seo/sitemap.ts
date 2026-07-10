import type { MetadataRoute } from 'next';
import type { SeoHostContext } from '@/lib/seo/host';

/**
 * Host-aware sitemap: lists the public routes for the serving host with its own
 * absolute origin (fixes the partner host previously emitting buyer URLs) plus
 * the AI text endpoints so crawlers can discover them.
 */
const PRIORITY_ROOT = 1;
const PRIORITY_SIGNUP = 0.7;
const PRIORITY_UTILITY = 0.5;
const PRIORITY_AI_ENDPOINT = 0.3;

export function buildSitemap(ctx: SeoHostContext, lastModified: Date): MetadataRoute.Sitemap {
  const { origin, type } = ctx;
  // Partner host is noindexed (see lib/seo/robots.ts) — nothing to submit.
  if (type === 'pg') return [];
  const signupPath = '/signup/buyer';
  return [
    { url: `${origin}/`, lastModified, changeFrequency: 'weekly', priority: PRIORITY_ROOT },
    { url: `${origin}${signupPath}`, lastModified, changeFrequency: 'monthly', priority: PRIORITY_SIGNUP },
    { url: `${origin}/login`, lastModified, changeFrequency: 'monthly', priority: PRIORITY_UTILITY },
    { url: `${origin}/llms.txt`, lastModified, changeFrequency: 'weekly', priority: PRIORITY_AI_ENDPOINT },
    { url: `${origin}/llms-full.txt`, lastModified, changeFrequency: 'weekly', priority: PRIORITY_AI_ENDPOINT },
  ];
}
