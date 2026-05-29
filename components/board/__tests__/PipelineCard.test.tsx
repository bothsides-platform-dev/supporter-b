import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BoardCard } from '@/lib/types/column';
import type { PgKanbanCard } from '@/lib/server/pg-kanban';

// useRecentlyViewedInbox 는 localStorage 기반 — 단위 테스트에서 mock으로 제어
vi.mock('@/lib/stores/recently-viewed-inbox', () => ({
  useRecentlyViewedInbox: vi.fn(),
}));

import { useRecentlyViewedInbox } from '@/lib/stores/recently-viewed-inbox';
import { PipelineCard } from '../PipelineCard';

function makePgCard(overrides: Partial<PgKanbanCard> = {}): BoardCard {
  const payload: PgKanbanCard = {
    invitationId: 'inv-1',
    rfpId: 'P-2605-0001',
    title: '결제 시스템 PG 제안 요청',
    stage: 'received',
    deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...overrides,
  };
  return { cardType: 'invitation', cardId: 'inv-1', columnId: 'col-1', payload };
}

function mockStore(isViewed: (rfpId: string) => boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useRecentlyViewedInbox).mockImplementation((selector: (s: any) => any) =>
    selector({ isViewed, rfpIds: [], markViewed: vi.fn() }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PipelineCard — 최근 조회 배지', () => {
  it('신규(received) 카드를 조회한 경우 "최근 조회" 배지가 표시된다', () => {
    mockStore(() => true);
    render(<PipelineCard card={makePgCard({ stage: 'received' })} onSelect={vi.fn()} />);
    expect(screen.getByText('최근 조회')).toBeInTheDocument();
  });

  it('신규(received) 카드지만 조회하지 않은 경우 배지가 없다', () => {
    mockStore(() => false);
    render(<PipelineCard card={makePgCard({ stage: 'received' })} onSelect={vi.fn()} />);
    expect(screen.queryByText('최근 조회')).not.toBeInTheDocument();
  });

  it('제출완료(submitted) 카드는 조회했더라도 배지가 없다', () => {
    mockStore(() => true);
    render(<PipelineCard card={makePgCard({ stage: 'submitted' })} onSelect={vi.fn()} />);
    expect(screen.queryByText('최근 조회')).not.toBeInTheDocument();
  });

  it('낙찰(won) 카드는 배지가 없다', () => {
    mockStore(() => true);
    render(<PipelineCard card={makePgCard({ stage: 'won' })} onSelect={vi.fn()} />);
    expect(screen.queryByText('최근 조회')).not.toBeInTheDocument();
  });
});
