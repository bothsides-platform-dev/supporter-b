// Screen-reader announcements + instructions for the kanban DnD.
//
// a11y NOTE: full keyboard drag-and-drop (@dnd-kit KeyboardSensor) is
// DELIBERATELY NOT wired up. The KeyboardSensor captures Enter/Space on the
// draggable to pick a card up, which kills the card's own Enter-to-open click
// (a known regression — see the board history). Until we ship a dedicated
// keyboard "move" affordance that doesn't hijack Enter, we give pointer/touch
// users the drag and give assistive-tech users a live region that narrates the
// drag instead. These builders are pure so the wording is unit-testable.
//
// dnd-kit renders the managed aria-live region itself when we pass
// `accessibility={{ announcements, screenReaderInstructions }}` to DndContext.
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

export const boardScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    '카드를 마우스나 터치로 끌어 다른 컬럼에 놓으면 이동합니다. 카드를 누르면 상세가 열립니다.',
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
      return '카드를 잡았어요. 옮길 컬럼 위로 끌어주세요.';
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
