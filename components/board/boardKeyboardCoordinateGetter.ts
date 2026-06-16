import type { KeyboardCoordinateGetter } from '@dnd-kit/core';

// 칸반 보드 전용 키보드 좌표 게터.
// KeyboardSensor 에 전달해 ArrowLeft/ArrowRight 가 이전/다음 컬럼 중심으로
// 드래그 포인터를 이동시키도록 한다.
export const boardKeyboardCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { over, droppableRects, droppableContainers } },
) => {
  const DELTA: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
  const delta = DELTA[event.code];
  if (delta === undefined) return undefined;

  event.preventDefault();

  // column:* ID 만 수집 → x 위치 기준 정렬
  const cols = Array.from(droppableContainers.keys())
    .filter((id) => String(id).startsWith('column:'))
    .map((id) => ({ id, rect: droppableRects.get(id) }))
    .filter((c): c is { id: typeof c.id; rect: NonNullable<typeof c.rect> } => !!c.rect)
    .sort((a, b) => a.rect.left - b.rect.left);

  if (cols.length === 0) return undefined;

  const currentIdx = over ? cols.findIndex((c) => c.id === over.id) : -1;
  const nextIdx = currentIdx + delta;
  if (nextIdx < 0 || nextIdx >= cols.length || nextIdx === currentIdx) return undefined;

  const rect = cols[nextIdx].rect;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
