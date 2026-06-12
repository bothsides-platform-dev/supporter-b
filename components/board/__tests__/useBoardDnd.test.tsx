import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));
const moveCard = vi.fn(async (_i: unknown) => ({ ok: true as const }));
const release = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/board/moveCardAction', () => ({
  moveCardAction: (i: unknown) => moveCard(i),
}));
vi.mock('@/lib/server/actions/board/releaseCardAction', () => ({
  releaseCardAction: (i: unknown) => release(i),
}));

import { useBoardDnd } from '../useBoardDnd';

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

const activeCol = col({ id: 'c-active', title: '진행중', lifecycleKey: 'active', position: 'a1' });
const awardedCol = col({ id: 'c-awarded', title: '선정 완료', lifecycleKey: 'awarded', position: 'a2' });
const closedCol = col({ id: 'c-closed', title: '마감', lifecycleKey: 'closed', position: 'a3' });
const customCol = col({ id: 'c-hold', title: '보류', position: 'a4' });

const rfpCard: BoardCard = {
  cardType: 'rfp',
  cardId: 'r1',
  columnId: 'c-active',
  payload: { rfpId: 'P-2605-0001', title: '결제대행 RFP', stage: 'active' },
};

const columns = [activeCol, awardedCol, closedCol, customCol];

function drop(cardId: string, toColumnId: string): DragEndEvent {
  return {
    active: { id: `card:${cardId}` },
    over: { id: `column:${toColumnId}` },
  } as unknown as DragEndEvent;
}

function setup(cards: BoardCard[] = [rfpCard]) {
  return renderHook(() =>
    useBoardDnd({ cardType: 'rfp', columns, cards }),
  );
}

describe('useBoardDnd', () => {
  beforeEach(() => {
    refresh.mockClear();
    push.mockClear();
    toast.mockClear();
    moveCard.mockClear();
    release.mockClear();
  });

  it('navigate lifecycle drop routes to the rfp detail immediately (no dialog)', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-awarded'));
    });
    expect(push).toHaveBeenCalledWith('/rfp/P-2605-0001');
    expect(result.current.pendingAction).toBeNull();
  });

  it('action lifecycle drop opens the confirm dialog instead of routing', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-closed'));
    });
    expect(push).not.toHaveBeenCalled();
    expect(result.current.pendingAction).toEqual({
      kind: 'cancel-rfp',
      rfpId: 'P-2605-0001',
      title: '결제대행 RFP',
    });
  });

  it('custom column drop places the card via moveCardAction', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-hold'));
    });
    expect(moveCard).toHaveBeenCalledWith({
      cardType: 'rfp',
      cardId: 'r1',
      toColumnId: 'c-hold',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('invalid lifecycle transition rejects with a toast and no side effects', async () => {
    const awardedCard: BoardCard = {
      cardType: 'rfp',
      cardId: 'r2',
      columnId: 'c-awarded',
      payload: { rfpId: 'P-2605-0002', title: '끝난 RFP', stage: 'awarded' },
    };
    const { result } = setup([awardedCard]);
    await act(async () => {
      result.current.handleDragEnd(drop('r2', 'c-closed'));
    });
    expect(toast).toHaveBeenCalledWith('이 컬럼으로는 이동할 수 없습니다.', { type: 'info' });
    expect(push).not.toHaveBeenCalled();
    expect(moveCard).not.toHaveBeenCalled();
    expect(result.current.pendingAction).toBeNull();
  });

  it('dropping on the current column is a no-op', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-active'));
    });
    expect(push).not.toHaveBeenCalled();
    expect(moveCard).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('groups cards by (optimistic) column', () => {
    const { result } = setup();
    expect(result.current.grouped.get('c-active')).toHaveLength(1);
    expect(result.current.grouped.get('c-hold')).toHaveLength(0);
  });

  it('드롭 직후 서버 응답 전에도 카드가 새 컬럼으로 보인다 (optimistic override)', async () => {
    let resolveMove!: (v: { ok: true }) => void;
    moveCard.mockImplementationOnce(
      () => new Promise<{ ok: true }>((res) => (resolveMove = res)),
    );
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-hold'));
    });
    // 서버 액션 pending 동안 optimistic 배치가 보여야 한다 (없으면 카드가 스냅백처럼 보임).
    expect(result.current.grouped.get('c-hold')?.map((c) => c.cardId)).toContain('r1');
    expect(result.current.grouped.get('c-active')).toHaveLength(0);
    await act(async () => {
      resolveMove({ ok: true });
    });
  });

  it('카드 위에 드롭하면 그 카드의 컬럼으로 배치된다', async () => {
    const other: BoardCard = {
      cardType: 'rfp',
      cardId: 'r2',
      columnId: 'c-hold',
      payload: { rfpId: 'P-2605-0002', title: '보류 RFP', stage: 'active' },
    };
    const { result } = setup([rfpCard, other]);
    await act(async () => {
      result.current.handleDragEnd({
        active: { id: 'card:r1' },
        over: { id: 'card:r2' },
      } as never);
    });
    expect(moveCard).toHaveBeenCalledWith({
      cardType: 'rfp',
      cardId: 'r1',
      toColumnId: 'c-hold',
    });
  });

  it('moveCardAction 실패 시 에러 토스트 + refresh 는 그대로 호출', async () => {
    moveCard.mockResolvedValueOnce({ ok: false, error: 'NOT_A_DROP_TARGET' } as never);
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-hold'));
    });
    expect(toast).toHaveBeenCalledWith('이동하지 못했어요 — NOT_A_DROP_TARGET', {
      type: 'error',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('default-landing 컬럼 드롭은 releaseCardAction 으로 배치를 해제한다 (bid 보드)', async () => {
    const landingCol = col({
      id: 'c-inbox',
      title: '진행전',
      lifecycleKey: 'inbox',
      position: 'a0',
    });
    const bidCard: BoardCard = {
      cardType: 'bid',
      cardId: 'b1',
      columnId: 'c-hold',
      payload: { id: 'b1' },
    };
    const { result } = renderHook(() =>
      useBoardDnd({ cardType: 'bid', columns: [landingCol, customCol], cards: [bidCard] }),
    );
    await act(async () => {
      result.current.handleDragEnd(drop('b1', 'c-inbox'));
    });
    expect(release).toHaveBeenCalledWith({ cardType: 'bid', cardId: 'b1' });
    expect(refresh).toHaveBeenCalled();
  });

  it('over 가 없으면 (보드 밖 드롭) 아무 일도 일어나지 않는다', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragEnd({ active: { id: 'card:r1' }, over: null } as never);
    });
    expect(moveCard).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('drag start exposes activeCard and pre-evaluated valid drop targets', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragStart({
        active: { id: 'card:r1', data: { current: { card: rfpCard } } },
      } as never);
    });
    expect(result.current.activeCard?.cardId).toBe('r1');
    expect(result.current.validDropTargets?.has('c-awarded')).toBe(true);
    expect(result.current.validDropTargets?.has('c-hold')).toBe(true);
  });

  it('drag end/cancel clears activeCard', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.handleDragStart({
        active: { id: 'card:r1', data: { current: { card: rfpCard } } },
      } as never);
    });
    await act(async () => {
      result.current.handleDragEnd(drop('r1', 'c-hold'));
    });
    expect(result.current.activeCard).toBeNull();

    await act(async () => {
      result.current.handleDragStart({
        active: { id: 'card:r1', data: { current: { card: rfpCard } } },
      } as never);
    });
    await act(async () => {
      result.current.handleDragCancel();
    });
    expect(result.current.activeCard).toBeNull();
    expect(result.current.validDropTargets).toBeNull();
  });
});
