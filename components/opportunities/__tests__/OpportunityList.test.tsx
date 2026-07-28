import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatDate } from '@/lib/utils/format';
import type { OpportunityListing } from '@/lib/types/pg-request';

// OpportunityList 는 행마다 OpportunityRequestDialog(클라이언트)를 렌더하므로
// 그 의존성(next/navigation·toast·server action)을 가볍게 mock.
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));

import { OpportunityList } from '../OpportunityList';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

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
    contractType: null,
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

  it('구매사명·제목을 1차로 보여주고 마감은 D-n 칩으로 강조한다', () => {
    render(
      <OpportunityList
        items={[makeItem({ deadline: new Date(Date.now() + 2 * 86_400_000).toISOString() })]}
      />,
    );
    expect(screen.getByText('구매사ABC')).toBeTruthy();
    expect(screen.getByText(/PG 견적 요청 건/)).toBeTruthy();
    expect(screen.getByTestId('deadline-chip')).toHaveTextContent('D-2');
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

  it("contractType 'new' 이면 '신규 계약' Chip을 표시한다", () => {
    render(<OpportunityList items={[makeItem({ contractType: 'new' })]} />);
    expect(screen.getByText('신규 계약')).toBeTruthy();
  });

  it("contractType 'renewal' 이면 '갱신 계약' Chip을 표시한다", () => {
    render(<OpportunityList items={[makeItem({ contractType: 'renewal' })]} />);
    expect(screen.getByText('갱신 계약')).toBeTruthy();
  });

  it('contractType 없으면 계약 유형 Chip을 표시하지 않는다', () => {
    render(<OpportunityList items={[makeItem({ contractType: null })]} />);
    expect(screen.queryByText('신규 계약')).toBeNull();
    expect(screen.queryByText('갱신 계약')).toBeNull();
  });

  it('구매사 홈페이지 링크가 새 탭으로 열린다는 사실을 접근성 이름에 싣는다', () => {
    // 라벨이 도메인(shop.example.com)이라 새 탭 여부는 시각적으로도 알 수 없었다.
    render(<OpportunityList items={[makeItem()]} />);
    const link = screen.getByRole('link', { name: /shop\.example\.com/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAccessibleName(new RegExp(NEW_TAB_NOTICE));
    expect(screen.getByText(NEW_TAB_NOTICE)).toHaveClass('sr-only');
  });
});
