import { expect, it } from 'vitest';
import { completionMetrics } from '../metrics';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
it('관측에는 수정·거절·fallback 건수만 넣고 사업자·홈페이지·제안 원문을 제외한다', () => {
  const context = { ...newQuoteContext(), bizNo: '1248100998', companyName: '비공개 회사', confirmed: ['website'], userFields: ['mainProducts'], rejectedFields: ['mainProducts'],
    websiteResult: { status: 'partial' as const, suggestions: [{ field: 'mainProducts' as const, value: '비공개 상품', source: 'rules' as const, sourceUrl: 'https://private.example.com', evidence: '비공개 상품' }], needsConfirmation: ['mainProducts'] } };
  const result = completionMetrics(context);
  expect(result).toEqual({ suggested: 1, edited: 1, rejected: 1, fallback: true });
  expect(JSON.stringify(result)).not.toMatch(/비공개|1248100998|example/);
});
