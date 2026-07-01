import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { appOrigins } from '@/lib/site-routing';
import { seoHostContext } from '@/lib/seo/host';
import { buildSitemap } from '@/lib/seo/sitemap';

// Host-aware: each host lists its own public routes with its own origin.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host');
  const ctx = seoHostContext(host, appOrigins());
  return buildSitemap(ctx, new Date());
}
