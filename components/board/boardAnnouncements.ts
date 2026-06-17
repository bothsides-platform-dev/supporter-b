// Screen-reader announcements + instructions for the kanban DnD.
//
// 키보드 드래그: 각 카드에 전용 드래그 핸들(GripVertical, setActivatorNodeRef)이
// 있어 KeyboardSensor 가 Enter/Space 를 드래그 핸들에서만 받으므로 카드 버튼의
// Enter-to-open 클릭을 죽이지 않는다.
//
// dnd-kit renders the managed aria-live region itself when we pass
// `accessibility={{ announcements, screenReaderInstructions }}` to DndContext.
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

export const boardScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    '카드를 마우스·터치로 끌거나, 드래그 핸들에서 Space 또는 Enter 를 눌러 카드를 집은 뒤 화살표 키로 이동합니다.',
};

// over.id for a column droppable is `column:<id>`; strip the prefix to look up
// the human title. Cards are draggable-only so over is always a column.
function columnIdFromOver(overId: string): string {
  return overId.startsWith('column:') ? overId.slice('column:'.length) : overId;
}

/**
 * Builds the dnd-kit announcer set. `columnTitle` resolves a column id → its
 * display title so the SR text names the destination ("진행중 컬럼으로 이동");
 * falls back to a generic phrasing when unknown.
 */
export function buildBoardAnnouncements(opts?: {
  columnTitle?: (columnId: string) => string | null;
}): Announcements {
  const titleOf = (overId: string): string | null =>
    opts?.columnTitle?.(columnIdFromOver(overId)) ?? null;

  return {
    onDragStart() {
      return '카드를 잡았어요. 화살표 키로 컬럼을 이동하거나, 끌어 다른 컬럼에 놓으세요.';
    },
    onDragOver({ over }) {
      if (!over) return '카드가 보드 밖에 있어요.';
      const title = titleOf(String(over.id));
      return title
        ? `${title} 컬럼으로 이동할 수 있어요.`
        : '이동할 수 있는 컬럼 위예요.';
    },
    onDragEnd({ over }) {
      if (!over) return '드롭을 취소했어요. 카드를 원래 자리로 되돌렸어요.';
      const title = titleOf(String(over.id));
      return title
        ? `${title} 컬럼에 카드를 놓았어요.`
        : '카드를 이동했어요.';
    },
    onDragCancel() {
      return '드롭을 취소했어요. 카드를 원래 자리로 되돌렸어요.';
    },
  };
}
