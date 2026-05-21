// KanbanBoard 카드 클릭 → 상세로 soft-nav(가로채기 모달 진입점). 미리보기 모달
// (KanbanCardDetailModal) 대신 router.push 로 /rfp/<code>·/inbox/<code> 이동.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

// 드래그 액션 확인 다이얼로그는 서버 액션(→ next-auth/next/server)을 끌어와
// jsdom 임포트를 깨뜨린다. 카드 클릭 네비게이션 테스트와 무관하므로 stub.
vi.mock('../KanbanActionDialog', () => ({
  KanbanActionDialog: () => null,
}));

import { KanbanBoard } from '../KanbanBoard';
import type { BuyerKanbanCard } from '@/lib/server/buyer-kanban';
import type { PgKanbanCard } from '@/lib/server/pg-kanban';

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

const buyerCard: BuyerKanbanCard = {
  rfpId: 'P-2604-0001',
  title: '구매사 RFP',
  stage: 'sent',
  deadline: future,
  createdAt: future,
  invitedPgCount: 0,
  submittedBidCount: 0,
};

const pgCard: PgKanbanCard = {
  invitationId: 'inv-1',
  rfpId: 'P-2604-0002',
  title: 'PG RFP',
  stage: 'received',
  deadline: future,
};

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('KanbanBoard 카드 클릭 네비게이션', () => {
  it('구매사 카드 클릭 → /rfp/<code>', async () => {
    const user = userEvent.setup();
    render(<KanbanBoard role="buyer" cards={[buyerCard]} />);
    await user.click(screen.getByText('구매사 RFP'));
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0001');
  });

  it('PG 카드 클릭 → /inbox/<code>', async () => {
    const user = userEvent.setup();
    render(<KanbanBoard role="pg" cards={[pgCard]} />);
    await user.click(screen.getByText('PG RFP'));
    expect(push).toHaveBeenCalledWith('/inbox/P-2604-0002');
  });
});
