import { headers } from 'next/headers';
import { appOrigins } from '@/lib/site-routing';
import { seoHostContext } from '@/lib/seo/host';
import { buildLlmsFullTxt } from '@/lib/seo/llms';

// Host-aware (buyer vs pg) → per-request. Cached at the edge via Cache-Control.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const host = (await headers()).get('host');
  const ctx = seoHostContext(host, appOrigins());
  return new Response(buildLlmsFullTxt(ctx), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
