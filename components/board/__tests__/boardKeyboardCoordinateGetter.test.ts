import { describe, it, expect } from 'vitest';
import { boardKeyboardCoordinateGetter } from '../boardKeyboardCoordinateGetter';

// droppableContainers와 droppableRects를 흉내낸 최소 구조
function makeRect(left: number, top: number, width = 200, height = 400) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function makeContext({
  overId,
  columns,
}: {
  overId?: string;
  columns: Array<{ id: string; left: number }>;
}) {
  const droppableRects = new Map(
    columns.map((c) => [c.id, makeRect(c.left, 100)]),
  );
  const droppableContainers = new Map(
    columns.map((c) => [c.id, { id: c.id }]),
  );
  return {
    currentCoordinates: { x: 0, y: 0 },
    context: {
      active: null,
      over: overId ? { id: overId } : null,
      droppableRects,
      droppableContainers,
      activatorEvent: null,
      collisions: [],
      draggingNodeRect: null,
    } as unknown as Parameters<typeof boardKeyboardCoordinateGetter>[1]['context'],
  };
}

const COLS = [
  { id: 'column:a', left: 0 },
  { id: 'column:b', left: 220 },
  { id: 'column:c', left: 440 },
];

describe('boardKeyboardCoordinateGetter', () => {
  it('ArrowRight → 다음 컬럼 중심 좌표를 반환한다', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight' });
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:a', columns: COLS }));
    expect(result).toEqual({ x: 220 + 100, y: 100 + 200 }); // column:b 중심
  });

  it('ArrowLeft → 이전 컬럼 중심 좌표를 반환한다', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowLeft' });
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:c', columns: COLS }));
    expect(result).toEqual({ x: 220 + 100, y: 100 + 200 }); // column:b 중심
  });

  it('이미 마지막 컬럼에서 ArrowRight → undefined 반환', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight' });
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:c', columns: COLS }));
    expect(result).toBeUndefined();
  });

  it('첫 컬럼에서 ArrowLeft → undefined 반환', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowLeft' });
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:a', columns: COLS }));
    expect(result).toBeUndefined();
  });

  it('column: 접두사 없는 droppable 은 무시한다', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight' });
    const colsWithExtra = [
      { id: 'column:a', left: 0 },
      { id: 'card:xyz', left: 50 },  // 무시돼야 함
      { id: 'column:b', left: 220 },
    ];
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:a', columns: colsWithExtra }));
    expect(result).toEqual({ x: 220 + 100, y: 100 + 200 });
  });

  it('관련 없는 키 → undefined 반환', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowUp' });
    const result = boardKeyboardCoordinateGetter(event, makeContext({ overId: 'column:a', columns: COLS }));
    expect(result).toBeUndefined();
  });
});
