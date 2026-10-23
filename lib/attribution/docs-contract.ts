// Wire contract duplicated in docs-support-b and supporter-b at lib/attribution/docs-contract.ts.
// Change both copies together; arbitrary campaign text must not reach GA.
export const CAMPAIGN_SOURCES = ['naver', 'google', 'bing', 'kakao', 'linkedin', 'facebook', 'instagram', 'newsletter', 'meta', 'docs'] as const;
export const CAMPAIGN_MEDIUMS = ['organic', 'cpc', 'paid_social', 'social', 'email', 'referral', 'paid', 'owned', 'earned'] as const;
export const DOCS_PLACEMENTS = ['header_logo', 'header_cta', 'footer_home', 'footer_privacy', 'footer_terms', 'footer_marketing', 'not_found_home', 'cta_existing', 'cta_new', 'article_body', 'utm_tool'] as const;
export type DocsPlacement = typeof DOCS_PLACEMENTS[number];
export const DOCS_PARAMS = ['sb_via', 'sb_docs_path', 'sb_docs_placement', 'sb_docs_source', 'sb_docs_medium'] as const;
export const safeSource = (value: unknown): string => (CAMPAIGN_SOURCES as readonly unknown[]).includes(value) ? value as string : 'unknown';
export const safeMedium = (value: unknown): string => (CAMPAIGN_MEDIUMS as readonly unknown[]).includes(value) ? value as string : 'unknown';
export function safeDocsPath(value: string): string {
  const path = value.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  // Only public document routes; bounded to GA's event parameter value limit.
  return path.length <= 100 && /^(?:\/|\/(?:articles|glossary)(?:\/[a-z0-9-]+)?|\/authors\/[a-z0-9-]+|\/tools\/utm)$/.test(path) ? path : '/other';
}
export type DocsFields = {
  docs_assisted: 'true' | 'false';
  docs_path: string;
  docs_placement: string;
  docs_source: string;
  docs_medium: string;
};
