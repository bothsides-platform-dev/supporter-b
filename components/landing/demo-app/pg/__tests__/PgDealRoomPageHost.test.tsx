import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox/P-2606-0042',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/inbox/RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div>요청 상세</div>,
}));
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: ({ onGuestSubmit }: { onGuestSubmit?: () => void }) => (
    <div>
      견적 작성 폼
      <button type="button" onClick={onGuestSubmit}>guest-submit</button>
    </div>
  ),
}));

import { PgDealRoomPageHost } from '../PgDealRoomPageHost';

afterEach(cleanup);

describe('PgDealRoomPageHost', () => {
  // 실제 PG 딜룸(PgDealRoomBody)의 탭 구성은 요청 조건 · 견적 작성 · 첨부다.
  // 데모가 탭을 직접 조립하면 여기서 조용히 갈라진다 — 실제 본문을 그대로 쓴다.
  it('실제 PG 딜룸과 같은 탭 구성을 그리고 중복 액션 레일은 없다', () => {
    render(<PgDealRoomPageHost onGuestSubmit={vi.fn()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '요청 조건',
      '견적 작성',
      '첨부',
    ]);
    expect(screen.queryByRole('navigation', { name: '견적 작업' })).not.toBeInTheDocument();
    expect(screen.getByText('요청 상세')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '견적 작성' }));
    expect(screen.getByText('견적 작성 폼')).toBeInTheDocument();
  });

  it('게스트 제출을 호스트의 onGuestSubmit 으로 내보낸다', () => {
    const onGuestSubmit = vi.fn();
    render(<PgDealRoomPageHost onGuestSubmit={onGuestSubmit} />);
    fireEvent.click(screen.getByRole('tab', { name: '견적 작성' }));
    fireEvent.click(screen.getByRole('button', { name: 'guest-submit' }));
    expect(onGuestSubmit).toHaveBeenCalled();
  });

  it('첨부 탭은 실제 딜룸과 같은 안내를 보여준다', () => {
    render(<PgDealRoomPageHost onGuestSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '첨부' }));
    expect(screen.getByText('구매사가 첨부한 파일이 없어요.')).toBeInTheDocument();
  });
});
