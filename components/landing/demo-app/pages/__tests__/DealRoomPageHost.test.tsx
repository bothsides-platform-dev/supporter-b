import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => '/rfp/P-2606-0042',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn(), get: vi.fn() } }));
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: vi.fn(),
  requestRequoteAction: vi.fn(),
  cancelRfpAction: vi.fn(),
  closeRfpAction: vi.fn(),
  createPgRequestAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/rfp/requestRequoteAction', () => ({ requestRequoteAction: vi.fn() }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: vi.fn(),
}));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: () => <div data-testid="counterparty" />,
}));

import { DealRoomPageHost } from '../DealRoomPageHost';

afterEach(cleanup);

// 실제 구매사 딜룸(BuyerDealRoomBody)은 탭 4개 + 좌측 작업 레일로 구성된다.
// 데모가 FocusComparison 하나만 그리면 실제 화면과 가장 크게 갈라지는 지점이었다.
describe('DealRoomPageHost — 실제 구매사 딜룸 정렬', () => {
  it('실제 딜룸과 같은 탭 구성과 작업 레일을 그린다', () => {
    render(<DealRoomPageHost />);
    // 첫 tablist = 딜룸 가운데 탭 바. 두 번째는 견적 비교 안의 PG 선택 스트립이다.
    const dealTabs = screen.getAllByRole('tablist')[0];
    expect(within(dealTabs).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      '견적 비교',
      '요청 조건',
      '첨부',
      'PG 관리',
    ]);
    expect(screen.getByRole('navigation', { name: '견적 작업' })).toBeInTheDocument();
  });

  it('견적 비교 탭이 기본이고 비교 요약을 보여준다', () => {
    render(<DealRoomPageHost />);
    expect(screen.getByText('지금 조건보다 이만큼 좋아져요')).toBeInTheDocument();
  });

  it('레일 선정은 서버 액션 대신 가입으로 보낸다', () => {
    render(<DealRoomPageHost />);
    fireEvent.click(screen.getByRole('button', { name: '선정' }));
    expect(push).toHaveBeenCalledWith('/signup/buyer');
  });

  it('모든 데모 쓰기 액션은 서버 액션 대신 가입으로 보낸다', () => {
    push.mockClear();
    render(<DealRoomPageHost />);

    fireEvent.click(screen.getByRole('button', { name: '수정 요청' }));
    fireEvent.click(screen.getByRole('button', { name: '선정 없이 종료' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(push).toHaveBeenCalledTimes(3);
    expect(push).toHaveBeenNthCalledWith(1, '/signup/buyer');
    expect(push).toHaveBeenNthCalledWith(2, '/signup/buyer');
    expect(push).toHaveBeenNthCalledWith(3, '/signup/buyer');
  });

  it('요청 조건·첨부 탭으로 이동할 수 있다', () => {
    render(<DealRoomPageHost />);
    fireEvent.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(screen.queryByText('지금 조건보다 이만큼 좋아져요')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '첨부' }));
    expect(screen.getByRole('tab', { name: '첨부' })).toHaveAttribute('aria-selected', 'true');
  });
});
