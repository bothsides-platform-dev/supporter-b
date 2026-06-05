import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatDate } from '@/lib/format';
import type { OpportunityListing } from '@/lib/types/pg-request';

// OpportunityList 는 행마다 OpportunityRequestDialog(클라이언트)를 렌더하므로
// 그 의존성(next/navigation·toast·server action)을 가볍게 mock.
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));

import { OpportunityList } from '../OpportunityList';

const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString();

function makeItem(overrides?: Partial<OpportunityListing>): OpportunityListing {
  return {
    rfpCode: 'P-2605-0001',
    buyerName: '구매사ABC',
    title: 'PG 견적 요청 건', // 결제수단·상품 라벨과 글자 겹치지 않게 중립적 제목 사용
    websiteUrl: 'https://shop.example.com',
    deadline: FUTURE,
    requiredPaymentMethods: ['card', 'kakao_pay'],
    customPaymentMethodLabels: ['포인트결제'],
    mainProducts: '전자책 구독',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('OpportunityList', () => {
  it('renders deadline, required payment methods (incl. custom labels), and main products', () => {
    render(<OpportunityList items={[makeItem()]} />);

    // 마감일: D-카운트다운 + 달력 날짜
    expect(screen.getByText(/D-\d/)).toBeTruthy();
    expect(screen.getByText(new RegExp(formatDate(FUTURE).replace(/\./g, '\\.')))).toBeTruthy();

    // 요구 결제수단: 키 → 한글 라벨 매핑 + 커스텀 라벨
    expect(screen.getByText(/카드/)).toBeTruthy();
    expect(screen.getByText(/카카오페이/)).toBeTruthy();
    expect(screen.getByText(/포인트결제/)).toBeTruthy();

    // 주요 상품·서비스
    expect(screen.getByText('전자책 구독')).toBeTruthy();
  });

  it('omits the payment-method and product lines when those fields are empty', () => {
    render(
      <OpportunityList
        items={[
          makeItem({ requiredPaymentMethods: [], customPaymentMethodLabels: [], mainProducts: null }),
        ]}
      />,
    );

    // 마감일은 항상 표시되지만, 빈 결제수단/상품 줄은 생략된다.
    expect(screen.getByText(/D-\d/)).toBeTruthy();
    expect(screen.queryByText(/카드/)).toBeNull();
    expect(screen.queryByText(/카카오페이/)).toBeNull();
    expect(screen.queryByText('전자책 구독')).toBeNull();
  });
});
