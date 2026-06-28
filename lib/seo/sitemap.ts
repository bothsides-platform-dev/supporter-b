import type { MetadataRoute } from 'next';
import type { SeoHostContext } from '@/lib/seo/host';

/**
 * Host-aware sitemap: lists the public routes for the serving host with its own
 * absolute origin (fixes the partner host previously emitting buyer URLs) plus
 * the AI text endpoints so crawlers can discover them.
 */
export function buildSitemap(ctx: SeoHostContext, lastModified: Date): MetadataRoute.Sitemap {
  const { origin, type } = ctx;
  const signupPath = type === 'pg' ? '/signup/pg' : '/signup/buyer';
  return [
    { url: `${origin}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}${signupPath}`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/login`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/llms.txt`, lastModified, changeFrequency: 'weekly', priority: 0.3 },
    { url: `${origin}/llms-full.txt`, lastModified, changeFrequency: 'weekly', priority: 0.3 },
  ];
}
