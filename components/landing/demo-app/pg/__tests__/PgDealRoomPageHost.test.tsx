import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/components/inbox/RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div>요청 상세</div>,
}));
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: () => <div>견적 작성 폼</div>,
}));

import { PgDealRoomPageHost } from '../PgDealRoomPageHost';

afterEach(cleanup);

describe('PgDealRoomPageHost', () => {
  it('실제 PG 딜룸처럼 탭 하나로 이동하고 중복 액션 레일을 그리지 않는다', () => {
    render(<PgDealRoomPageHost onGuestSubmit={vi.fn()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['요청 조건', '견적 작성']);
    expect(screen.queryByRole('navigation', { name: '견적 작업' })).not.toBeInTheDocument();
    expect(screen.getByText('요청 상세')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '견적 작성' }));
    expect(screen.getByText('견적 작성 폼')).toBeInTheDocument();
  });
});
