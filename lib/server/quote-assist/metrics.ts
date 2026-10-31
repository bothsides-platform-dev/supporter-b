import type { QuoteContext } from '@/lib/guest-rfp/quote-context';
export function completionMetrics(context: QuoteContext) {
  const fields = new Set([...(context.businessResult?.suggestions ?? []), ...(context.websiteResult?.suggestions ?? [])].map(s => s.field));
  return {
    suggested: fields.size,
    edited: [...fields].filter(field => context.userFields.includes(field)).length,
    rejected: [...fields].filter(field => context.rejectedFields?.includes(field)).length,
    fallback: context.businessResult?.status !== 'complete' || context.websiteResult?.status !== 'complete',
  };
}
