import { describe, expect, it } from 'vitest';

import { toQuoteTemplateOption } from '../quote-template-option';
import type { BidQuoteTemplate } from '../repositories/types';

// `QuoteTemplateOption` 은 견적 템플릿 repo 행을 클라이언트로 내려보내는 경계다.
// repo 행(11필드)에는 `createdBy`·`pgWsId` 같은 서버 전용 값이 있고, 폼 채우기에
// 필요한 것은 7필드뿐이다. 매퍼가 한 곳이 아니면 필드 추가 시 한쪽만 넓어지거나
// (드리프트) repo 행이 통째로 새어나간다(누출) — 그래서 키 집합을 정확히 못박는다.

const row: BidQuoteTemplate = {
  id: 'tmpl-1',
  pgWsId: 'ws-pg',
  name: '표준 요율표',
  settleCycle: 'D+2',
  settleLimit: 50_000_000,
  guaranteeInsurance: 10_000_000,
  signupFee: 300_000,
  paymentFees: { card: 2.5 },
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('toQuoteTemplateOption', () => {
  it('직렬화 부분집합 7필드만 내보낸다 (키 집합 고정)', () => {
    expect(Object.keys(toQuoteTemplateOption(row)).sort()).toEqual([
      'guaranteeInsurance',
      'id',
      'name',
      'paymentFees',
      'settleCycle',
      'settleLimit',
      'signupFee',
    ]);
  });

  it('repo 전용 필드는 결과에 담지 않는다', () => {
    const option = toQuoteTemplateOption(row) as Record<string, unknown>;

    expect(option.pgWsId).toBeUndefined();
    expect(option.createdBy).toBeUndefined();
    expect(option.createdAt).toBeUndefined();
    expect(option.updatedAt).toBeUndefined();
  });

  it('내보내는 필드의 값은 그대로 옮긴다', () => {
    expect(toQuoteTemplateOption(row)).toEqual({
      id: 'tmpl-1',
      name: '표준 요율표',
      settleCycle: 'D+2',
      settleLimit: 50_000_000,
      guaranteeInsurance: 10_000_000,
      signupFee: 300_000,
      paymentFees: { card: 2.5 },
    });
  });
});
