import type { QuoteTemplateOption } from '@/lib/types/bid';
import type { BidQuoteTemplate } from '@/lib/server/repositories/types';

/**
 * 견적 템플릿 repo 행 → 클라이언트 직렬화 부분집합.
 *
 * 견적 폼(딜룸 로더)과 템플릿 관리 페이지가 같은 projection 을 쓰므로 단일 출처로
 * 둔다 — 필드를 늘릴 때 한 곳만 고치면 되고, `createdBy`·`pgWsId` 같은 서버 전용
 * 값이 페이로드에 섞이지 않는다. 키 집합은 `__tests__/quote-template-option.test.ts`
 * 가 고정한다.
 */
export function toQuoteTemplateOption(t: BidQuoteTemplate): QuoteTemplateOption {
  return {
    id: t.id,
    name: t.name,
    settleCycle: t.settleCycle,
    settleLimit: t.settleLimit,
    guaranteeInsurance: t.guaranteeInsurance,
    signupFee: t.signupFee,
    paymentFees: t.paymentFees,
  };
}
