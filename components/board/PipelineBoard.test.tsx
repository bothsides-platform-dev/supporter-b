import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams('view=board'),
}));

// Mock the child components that require complex context (dnd-kit, etc.)
vi.mock('@/components/board/KanbanBoard', () => ({
  KanbanBoard: ({
    renderCard,
    cards,
  }: {
    renderCard: (c: unknown) => React.ReactNode;
    cards: unknown[];
  }) => (
    <div data-testid="kanban">
      {cards.map((c, i) => (
        <div key={i}>{renderCard(c)}</div>
      ))}
    </div>
  ),
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
  mockReplace.mockClear();
});

describe('PipelineBoard', () => {
  it('rfp 카드 클릭 시 view=board 유지하며 peek 파라미터 추가', async () => {
    const { findByText } = render(
      <PipelineBoard cardType="rfp" columns={[]} cards={cards} />,
    );
    const btn = await findByText('카드');
    btn.click();
    expect(mockReplace).toHaveBeenCalledWith('/rfp?view=board&peek=P-2604-0001');
  });
});
