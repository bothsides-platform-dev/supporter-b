import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
import type { BoardCard, BoardColumn } from '@/lib/types/column';

// useDroppable/useDraggable 을 안정 스텁으로 교체 — dnd-kit 내부 컨텍스트 갱신
// (센서 매 렌더 재생성 등)이 React.memo bail 검증에 간섭하지 않도록 한다.
// 실제 DndContext·useSensors·센서 클래스는 유지한다.
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal();
  const noopRef = () => {};
  return {
    ...(actual as object),
    useDroppable: () => ({ setNodeRef: noopRef, isOver: false }),
    useDraggable: () => ({
      attributes: { role: 'button', tabIndex: 0, 'aria-disabled': false, 'aria-pressed': undefined, 'aria-describedby': undefined, 'aria-roledescription': undefined },
      listeners: {},
      setNodeRef: noopRef,
      setActivatorNodeRef: noopRef,
      isDragging: false,
      transform: null,
      node: { current: null },
      over: null,
      active: null,
    }),
  };
});

const refresh = vi.fn();
const push = vi.fn();
// mockRouter 는 단일 객체 참조 — useRouter() 가 매 호출마다 새 객체를 반환하면
// useCallback([router]) 의 deps 가 매 렌더 바뀌어 onRefresh 신원이 불안정해지고
// BoardColumn memo 가 bail 하지 못한다. 안정 참조가 올바른 생산 환경 동작.
const mockRouter = { refresh, push };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
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
    ...over,
  };
}

const sysCol = col({ id: 'c-active', title: '진행중', lifecycleKey: 'active', position: 'a1' });
const customCol = col({ id: 'c-hold', title: '보류', position: 'a2' });

const cards: BoardCard[] = [
  { cardType: 'rfp', cardId: 'r1', columnId: 'c-active', payload: { rfpId: 'P-2605-0001', title: '결제대행 RFP', stage: 'active' } },
  { cardType: 'rfp', cardId: 'r2', columnId: 'c-hold', payload: { rfpId: 'P-2605-0002', title: '보류된 RFP', stage: 'active' } },
];

function renderBoard() {
  render(
    <KanbanBoard
      kind="pipeline"
      cardType="rfp"
      columns={[sysCol, customCol]}
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
    expect(screen.getByText('진행중')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    expect(screen.getByText('결제대행 RFP')).toBeInTheDocument();
    expect(screen.getByText('보류된 RFP')).toBeInTheDocument();
  });

  it('does not expose an add-column control', () => {
    renderBoard();
    expect(screen.queryByRole('button', { name: /열 추가/ })).not.toBeInTheDocument();
  });

  it('custom column menu does not offer delete', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: '보류 컬럼 메뉴' }));
    expect(screen.queryByRole('button', { name: '컬럼 삭제' })).not.toBeInTheDocument();
  });

  it('system column menu also does not offer delete', async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole('button', { name: '진행중 컬럼 메뉴' }));
    expect(screen.queryByRole('button', { name: '컬럼 삭제' })).not.toBeInTheDocument();
  });

  it('드래그 래퍼는 인터랙티브 요소가 아니다 — 카드 내부 버튼이 유일한 탭스톱', () => {
    renderBoard();
    // 이전 구현은 래퍼 div 에 dnd-kit attributes(role="button", tabIndex)를 그대로
    // 스프레드해 카드 텍스트가 접근성 이름인 가짜 버튼이 생겼다 (중첩 버튼 + 이중 탭스톱).
    expect(screen.queryByRole('button', { name: /결제대행 RFP/ })).not.toBeInTheDocument();
  });

  it('columnOverflow 컬럼은 limit 초과분을 숨기고 전체 보기 링크를 단다', () => {
    const many: BoardCard[] = Array.from({ length: 12 }, (_, i) => ({
      cardType: 'rfp',
      cardId: `m${i}`,
      columnId: 'c-active',
      payload: { rfpId: `P-${i}`, title: `RFP ${i}`, stage: 'active' },
    }));
    render(
      <KanbanBoard
        kind="pipeline"
        cardType="rfp"
        columns={[sysCol]}
        cards={many}
        renderCard={(c) => <div>{(c.payload as { title: string }).title}</div>}
        columnOverflow={(col) =>
          col.lifecycleKey === 'active'
            ? { limit: 10, moreHref: '/rfp?view=table&status=active' }
            : null
        }
      />,
    );
    expect(screen.getByText('RFP 9')).toBeInTheDocument();
    expect(screen.queryByText('RFP 10')).not.toBeInTheDocument();
    // 라벨은 건수를 약속하지 않는다 — 보드 N(필터 적용)과 표 도착지 건수가 다를 수 있음.
    const link = screen.getByRole('link', { name: '표에서 전체 보기' });
    expect(link).toHaveAttribute('href', '/rfp?view=table&status=active');
  });

  it('limit 이하면 링크 없이 전부 렌더한다', () => {
    render(
      <KanbanBoard
        kind="pipeline"
        cardType="rfp"
        columns={[sysCol, customCol]}
        cards={cards}
        renderCard={(c) => <div>{(c.payload as { title: string }).title}</div>}
        columnOverflow={() => ({ limit: 10, moreHref: '/rfp?view=table' })}
      />,
    );
    expect(screen.getByText('결제대행 RFP')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '표에서 전체 보기' })).not.toBeInTheDocument();
  });

  it('드래그 핸들 버튼(키보드 이동용) 과 renderCard 버튼이 각 1개씩 렌더된다', () => {
    render(
      <KanbanBoard
        kind="pipeline"
        cardType="rfp"
        columns={[sysCol]}
        cards={[cards[0]]}
        renderCard={(c) => (
          <button type="button">{(c.payload as { title: string }).title}</button>
        )}
      />,
    );
    // 드래그 핸들은 전용 tabStop — 카드 버튼과 분리돼 중첩 인터랙티브 없음.
    expect(screen.getAllByRole('button', { name: /드래그 핸들/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '결제대행 RFP' })).toHaveLength(1);
  });

  it('한 컬럼 메뉴 토글이 다른 컬럼 카드를 재렌더하지 않는다 (memo bail 발현)', async () => {
    const user = userEvent.setup();
    const renderCountById: Record<string, number> = {};
    const renderCardSpy = vi.fn((c: (typeof cards)[0]) => {
      renderCountById[c.cardId] = (renderCountById[c.cardId] ?? 0) + 1;
      return <div>{c.cardId}</div>;
    });

    render(
      <KanbanBoard
        kind="pipeline"
        cardType="rfp"
        columns={[sysCol, customCol]}
        cards={cards}
        renderCard={renderCardSpy}
      />,
    );

    // Initial render: each card rendered exactly once (r1 in c-active, r2 in c-hold).
    expect(renderCountById['r1']).toBe(1);
    expect(renderCountById['r2']).toBe(1);

    // Open column A (진행중/c-active) menu — triggers setOpenMenu state change in KanbanBoard.
    await user.click(screen.getByRole('button', { name: '진행중 컬럼 메뉴' }));

    // renderCard 는 BoardDraggableCard 내부에서 호출된다. renderCountById 가 1 로
    // 유지되면 BoardDraggableCard.memo 가 bail 했음 — children → renderCard prop 전환과
    // EMPTY_OVERRIDES/columnData useMemo 로 인해 card·renderCard 신원이 안정됐다는 증거.
    expect(renderCountById['r2']).toBe(1);
  });
});
