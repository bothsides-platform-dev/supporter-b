import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams('view=board'));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/rfp',
  useSearchParams: () => mockSearchParams(),
}));

// Mock the child components that require complex context (dnd-kit, etc.)
let lastColumnOverflow:
  | ((col: { lifecycleKey: string | null }) => { limit: number; moreHref: string } | null)
  | undefined;
vi.mock('@/components/board/KanbanBoard', () => ({
  KanbanBoard: ({
    renderCard,
    cards,
    columnOverflow,
  }: {
    renderCard: (c: unknown) => React.ReactNode;
    cards: unknown[];
    columnOverflow?: (col: {
      lifecycleKey: string | null;
    }) => { limit: number; moreHref: string } | null;
  }) => {
    lastColumnOverflow = columnOverflow;
    return (
      <div data-testid="kanban">
        {cards.map((c, i) => (
          <div key={i}>{renderCard(c)}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('@/components/board/PipelineCard', () => ({
  PipelineCard: ({ onSelect }: { onSelect: () => void }) => (
    <button onClick={onSelect}>카드</button>
  ),
}));

import React from 'react';
import { PipelineBoard } from './PipelineBoard';
import type { BoardCard } from '@/lib/types/column';

const cards: BoardCard[] = [
  {
    cardId: 'inv-1',
    columnId: 'col-1',
    cardType: 'rfp',
    payload: { rfpId: 'P-2604-0001' },
  },
];

afterEach(() => {
  cleanup();
  mockPush.mockClear();
  mockSearchParams.mockReturnValue(new URLSearchParams('view=board'));
});

describe('PipelineBoard', () => {
  it('rfp 카드 클릭 시 상세 라우트로 push 해 딜룸 모달을 연다', async () => {
    const { findByText } = render(
      <PipelineBoard cardType="rfp" columns={[]} cards={cards} />,
    );
    const btn = await findByText('카드');
    btn.click();
    // 보드 카드도 표 뷰 행과 동일하게 인터셉트 딜룸 모달로 — 과거 ?peek 사이드패널 제거.
    expect(mockPush).toHaveBeenCalledWith('/rfp/P-2604-0001');
  });

  it('buyer: 마감 컬럼에 표 뷰 딥링크 overflow 를 주입한다 (선정완료 병합 후 awarded 컬럼 없음)', () => {
    render(<PipelineBoard cardType="rfp" columns={[]} cards={[]} />);
    expect(lastColumnOverflow?.({ lifecycleKey: 'closed' })).toEqual({
      limit: 10,
      moreHref: '/rfp?view=table&status=closed',
    });
    // 선정완료·마감 병합 후 awarded lifecycle 컬럼은 더 이상 시드되지 않으며 overflow 도 없다.
    expect(lastColumnOverflow?.({ lifecycleKey: 'awarded' })).toBeNull();
    expect(lastColumnOverflow?.({ lifecycleKey: 'active' })).toBeNull();
  });

  it('pg: won/lost 컬럼은 inbox 표 마감 필터로 딥링크한다', () => {
    render(<PipelineBoard cardType="invitation" columns={[]} cards={[]} />);
    expect(lastColumnOverflow?.({ lifecycleKey: 'won' })).toEqual({
      limit: 10,
      moreHref: '/inbox?view=table&status=closed',
    });
    expect(lastColumnOverflow?.({ lifecycleKey: 'lost' })).toEqual({
      limit: 10,
      moreHref: '/inbox?view=table&status=closed',
    });
    expect(lastColumnOverflow?.({ lifecycleKey: 'received' })).toBeNull();
  });

  it('overflow 딥링크는 현재 deadline/grade 필터를 보존한다 (peek 등은 제외)', () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams('view=board&deadline=d7&grade=small&peek=P-2604-0001'),
    );
    render(<PipelineBoard cardType="rfp" columns={[]} cards={[]} />);
    expect(lastColumnOverflow?.({ lifecycleKey: 'closed' })?.moreHref).toBe(
      '/rfp?deadline=d7&grade=small&view=table&status=closed',
    );
  });
});
