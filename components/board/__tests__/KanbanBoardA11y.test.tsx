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

  it('uses our pointer/touch draggable instruction (no space-bar keyboard pickup)', () => {
    renderBoard();
    // Our custom instruction replaces dnd-kit's default English "press the space
    // bar" text — proving the KeyboardSensor pickup affordance is NOT advertised.
    expect(screen.getByText(/마우스나 터치로 끌어/)).toBeInTheDocument();
    expect(screen.queryByText(/space bar/i)).not.toBeInTheDocument();
  });
});
