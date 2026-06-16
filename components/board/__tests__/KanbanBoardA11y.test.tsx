import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
import type { BoardCard, BoardColumn } from '@/lib/types/column';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/home/KanbanActionDialog', () => ({ KanbanActionDialog: () => null }));
vi.mock('@/lib/server/actions/board/moveCardAction', () => ({ moveCardAction: vi.fn() }));
vi.mock('@/lib/server/actions/board/releaseCardAction', () => ({ releaseCardAction: vi.fn() }));
vi.mock('@/lib/server/actions/board/addColumnAction', () => ({ addColumnAction: vi.fn() }));
vi.mock('@/lib/server/actions/board/deleteColumnAction', () => ({ deleteColumnAction: vi.fn() }));
vi.mock('@/lib/server/actions/board/renameColumnAction', () => ({ renameColumnAction: vi.fn() }));
vi.mock('@/lib/server/actions/board/recolorColumnAction', () => ({ recolorColumnAction: vi.fn() }));

import { KanbanBoard } from '../KanbanBoard';

function col(over: Partial<BoardColumn> & { id: string; title: string }): BoardColumn {
  return {
    workspaceId: 'ws',
    kind: 'pipeline',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    ...over,
  };
}

const sysCol = col({ id: 'c-active', title: '진행중', lifecycleKey: 'active', position: 'a1' });
const cards: BoardCard[] = [
  { cardType: 'rfp', cardId: 'r1', columnId: 'c-active', payload: { rfpId: 'P-1', title: 'A', stage: 'active' } },
];

function renderBoard() {
  render(
    <KanbanBoard
      kind="pipeline"
      cardType="rfp"
      columns={[sysCol]}
      cards={cards}
      renderCard={(c) => <div>{(c.payload as { title: string }).title}</div>}
    />,
  );
}

describe('KanbanBoard a11y', () => {
  afterEach(cleanup);

  it('keeps the board region landmark labelled', () => {
    renderBoard();
    expect(screen.getByRole('region', { name: '칸반 보드' })).toBeInTheDocument();
  });

  it('renders a screen-reader live region for drag announcements', () => {
    renderBoard();
    // dnd-kit mounts a role="status" aria-live region driven by our announcers.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('드래그 핸들을 통한 키보드 이동 방법을 광고한다', () => {
    renderBoard();
    // 드래그 핸들(GripVertical) 에서 Space/Enter 로 카드를 집어올릴 수 있음을
    // 스크린리더 지시문이 안내한다.
    expect(screen.getByText(/드래그 핸들/)).toBeInTheDocument();
  });

  it('각 카드마다 드래그 핸들 버튼이 렌더된다', () => {
    renderBoard();
    expect(screen.getByRole('button', { name: /드래그 핸들/ })).toBeInTheDocument();
  });
});
