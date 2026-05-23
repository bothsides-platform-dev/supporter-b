import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
// Keep the lifecycle dialog (and its server-action import chain) out of jsdom.
vi.mock('@/components/home/KanbanActionDialog', () => ({
  KanbanActionDialog: () => null,
}));
const moveCard = vi.fn(async (_i: unknown) => ({ ok: true as const }));
const release = vi.fn(async (_i: unknown) => ({ ok: true as const }));
const addColumn = vi.fn(async (_i: unknown) => ({ ok: true as const, columnId: 'new' }));
const deleteColumn = vi.fn(async (_i: unknown) => ({ ok: true as const }));
const renameColumn = vi.fn(async (_i: unknown) => ({ ok: true as const }));
const recolorColumn = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/board/moveCardAction', () => ({ moveCardAction: (i: unknown) => moveCard(i) }));
vi.mock('@/lib/server/actions/board/releaseCardAction', () => ({ releaseCardAction: (i: unknown) => release(i) }));
vi.mock('@/lib/server/actions/board/addColumnAction', () => ({ addColumnAction: (i: unknown) => addColumn(i) }));
vi.mock('@/lib/server/actions/board/deleteColumnAction', () => ({ deleteColumnAction: (i: unknown) => deleteColumn(i) }));
vi.mock('@/lib/server/actions/board/renameColumnAction', () => ({ renameColumnAction: (i: unknown) => renameColumn(i) }));
vi.mock('@/lib/server/actions/board/recolorColumnAction', () => ({ recolorColumnAction: (i: unknown) => recolorColumn(i) }));

import { KanbanBoard } from '../KanbanBoard';

function col(over: Partial<BoardColumn> & { id: string; title: string }): BoardColumn {
  return {
    workspaceId: 'ws',
    kind: 'pipeline',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    isSystem: false,
    ...over,
  };
}

const draftCol = col({ id: 'c-draft', title: '작성중', lifecycleKey: 'draft', isSystem: true, position: 'a1' });
const customCol = col({ id: 'c-hold', title: '보류', isSystem: false, position: 'a2' });

const cards: BoardCard[] = [
  { cardType: 'rfp', cardId: 'r1', columnId: 'c-draft', position: null, payload: { rfpId: 'P-2605-0001', title: '결제대행 RFP', stage: 'draft' } },
  { cardType: 'rfp', cardId: 'r2', columnId: 'c-hold', position: 'a1', payload: { rfpId: 'P-2605-0002', title: '보류된 RFP', stage: 'draft' } },
];

function renderBoard() {
  render(
    <KanbanBoard
      kind="pipeline"
      cardType="rfp"
      columns={[draftCol, customCol]}
      cards={cards}
      renderCard={(c) => <div>{(c.payload as { title: string }).title}</div>}
    />,
  );
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    moveCard.mockClear();
    deleteColumn.mockClear();
    addColumn.mockClear();
    refresh.mockClear();
  });
  afterEach(cleanup);

  it('renders columns and their cards via renderCard', () => {
    renderBoard();
    expect(screen.getByText('작성중')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    expect(screen.getByText('결제대행 RFP')).toBeInTheDocument();
    expect(screen.getByText('보류된 RFP')).toBeInTheDocument();
  });

  it('a custom column menu offers delete; a system column does not', async () => {
    const user = userEvent.setup();
    renderBoard();

    // custom column → delete available
    await user.click(screen.getByRole('button', { name: '보류 컬럼 메뉴' }));
    expect(await screen.findByRole('button', { name: '컬럼 삭제' })).toBeInTheDocument();

    // system column → no delete (locked)
    await user.click(screen.getByRole('button', { name: '작성중 컬럼 메뉴' }));
    expect(screen.queryByRole('button', { name: '컬럼 삭제' })).not.toBeInTheDocument();
  });

  it('exposes an add-column control', () => {
    renderBoard();
    expect(screen.getByRole('button', { name: /열 추가/ })).toBeInTheDocument();
  });
});
