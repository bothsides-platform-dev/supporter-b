import type { MetadataRoute } from 'next';
import type { SeoHostContext } from '@/lib/seo/host';

/**
 * Host-aware sitemap: lists the public routes for the serving host with its own
 * absolute origin (fixes the partner host previously emitting buyer URLs) plus
 * the AI text endpoints so crawlers can discover them.
 */
const PRIORITY_ROOT = 1;
const PRIORITY_UTILITY = 0.5;
const PRIORITY_AI_ENDPOINT = 0.3;

export function buildSitemap(ctx: SeoHostContext): MetadataRoute.Sitemap {
  const { origin, type } = ctx;
  // Partner host is noindexed (see lib/seo/robots.ts) — nothing to submit.
  if (type === 'pg') return [];
  // 회원가입은 noindex다. 실제 수정 시각을 추적하지 않는 페이지에는 요청 시각을
  // lastModified로 넣지 않는다. 공개 법적 고지는 각 페이지의 canonical과 맞춘다.
  return [
    { url: `${origin}/`, changeFrequency: 'weekly', priority: PRIORITY_ROOT },
    { url: `${origin}/login`, changeFrequency: 'monthly', priority: PRIORITY_UTILITY },
    ...['/legal', '/legal/terms', '/legal/privacy', '/legal/marketing'].map((path) => ({
      url: `${origin}${path}`,
      priority: PRIORITY_UTILITY,
    })),
    { url: `${origin}/llms.txt`, changeFrequency: 'weekly', priority: PRIORITY_AI_ENDPOINT },
    { url: `${origin}/llms-full.txt`, changeFrequency: 'weekly', priority: PRIORITY_AI_ENDPOINT },
  ];
}
