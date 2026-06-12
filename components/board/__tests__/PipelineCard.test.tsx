import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BoardCard } from '@/lib/types/column';
import type { PgKanbanCard } from '@/lib/server/pg-kanban';
import type { BuyerKanbanCard } from '@/lib/server/buyer-kanban';

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
    hasPendingRequote: false,
    ...overrides,
  };
  return { cardType: 'invitation', cardId: 'inv-1', columnId: 'col-1', payload };
}

function makeBuyerCard(overrides: Partial<BuyerKanbanCard> = {}): BoardCard {
  const payload: BuyerKanbanCard = {
    rfpId: 'P-2605-0002',
    title: '결제대행 견적 요청',
    stage: 'active',
    deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedPgCount: 3,
    submittedBidCount: 1,
    isSample: false,
    isCancelled: false,
    ...overrides,
  };
  return { cardType: 'rfp', cardId: 'rfp-1', columnId: 'col-1', payload };
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

describe('PipelineCard — PG 카드 정보 보강', () => {
  beforeEach(() => mockStore(() => false));

  it('구매사명을 표시한다', () => {
    render(
      <PipelineCard card={makePgCard({ buyerName: '오롤리데이' })} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('오롤리데이')).toBeInTheDocument();
  });

  it('pending 재요청이 있으면 "재요청" 칩을 표시한다', () => {
    render(
      <PipelineCard
        card={makePgCard({ stage: 'submitted', hasPendingRequote: true })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('재요청')).toBeInTheDocument();
  });

  it('재요청이 없으면 칩이 없다', () => {
    render(
      <PipelineCard
        card={makePgCard({ stage: 'submitted', hasPendingRequote: false })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('재요청')).not.toBeInTheDocument();
  });
});

describe('PipelineCard — 구매사 카드 정보 보강', () => {
  beforeEach(() => mockStore(() => false));

  it('취소된 RFP 카드에 "취소됨" 칩을 표시한다', () => {
    render(
      <PipelineCard
        card={makeBuyerCard({ stage: 'closed', isCancelled: true })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it('취소가 아닌 마감 카드에는 칩이 없다', () => {
    render(
      <PipelineCard
        card={makeBuyerCard({ stage: 'closed', isCancelled: false })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('취소됨')).not.toBeInTheDocument();
  });

  it('결과 컬럼(awarded/closed) 카드는 D-day 칩을 숨긴다', () => {
    render(
      <PipelineCard card={makeBuyerCard({ stage: 'awarded' })} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText(/^D-\d+$/)).not.toBeInTheDocument();
  });

  it('closed 단계 카드도 D-day 칩을 숨긴다 (isResult 의 || 절 회귀 가드)', () => {
    render(
      <PipelineCard card={makeBuyerCard({ stage: 'closed' })} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText(/^D-\d+$/)).not.toBeInTheDocument();
  });

  it('진행중(active) 카드는 D-day 칩을 표시한다', () => {
    render(
      <PipelineCard card={makeBuyerCard({ stage: 'active' })} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/^D-\d+$/)).toBeInTheDocument();
  });
});
