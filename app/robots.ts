import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { appOrigins } from '@/lib/site-routing';
import { seoHostContext } from '@/lib/seo/host';
import { buildRobots } from '@/lib/seo/robots';

// Host-aware: each host (buyer / partner) gets robots referencing its own origin.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  const { origin } = seoHostContext(host, appOrigins());
  return buildRobots(origin);
}
