'use client';

import { memo, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardCard } from '@/lib/types/column';

// 전용 드래그 핸들 패턴 — setActivatorNodeRef 로 GripVertical 버튼만 활성화 지점으로
// 등록해 KeyboardSensor 의 Enter/Space 가 카드 버튼 클릭을 죽이지 않도록 한다.
// listeners 는 래퍼가 아닌 핸들에 스프레드 — attributes(role/tabIndex) 는 핸들이 내장하므로
// 래퍼에 추가 스프레드 없음. TouchSensor 길게 누르기는 핸들 위에서도 활성화된다.
//
// React.memo: 같은 card·children 이면 다른 카드/컬럼의 리렌더에 끌려 재렌더하지 않는다.
function BoardDraggableCardInner({
  card,
  children,
}: {
  card: BoardCard;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `card:${card.cardId}`,
    data: { card },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'manipulation' }}
      // select-none/touch-callout: 길게 누르기(250ms) 활성화 중 iOS 텍스트 선택
      // 돋보기·콜아웃이 드래그와 겹쳐 뜨는 것을 막는다.
      className={cn(
        'group/card relative select-none [-webkit-touch-callout:none]',
        isDragging && 'opacity-30',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label="드래그 핸들 — Space 또는 Enter 로 카드 이동"
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-5 z-10 flex items-center justify-center opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 rounded-l-[var(--md-sys-shape-medium)]"
      >
        <GripVertical
          size={12}
          className="text-[var(--md-sys-color-on-surface-variant)]"
          aria-hidden
        />
      </button>
      <div className="pl-5">{children}</div>
    </div>
  );
}

// memo 는 카드 컴포넌트 자체의 리렌더만 방어한다. 현재 부모가 children 으로
// renderCard(card) 결과를 인라인 주입하므로 children 참조가 매 렌더 바뀌어 bail 은
// 미발현이다(동작 동일). 카드 데이터+안정 renderCard 패턴으로 가면 발현 — 후속 과제.
export const BoardDraggableCard = memo(BoardDraggableCardInner);
