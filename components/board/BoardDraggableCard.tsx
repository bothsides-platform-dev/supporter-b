'use client';

import { memo, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { BoardCard } from '@/lib/types/column';

// 래퍼는 드래그 시작 리스너만 보유 — dnd-kit attributes(role/tabIndex)를 스프레드하면
// 카드 내부의 진짜 버튼과 중첩 버튼 시맨틱 + 이중 탭스톱이 생긴다. 시각 이동은
// DragOverlay 가 담당하므로 원본은 자리 placeholder 로만 남는다. touchAction 은
// 'manipulation' — TouchSensor 의 길게 누르기 활성화와 함께 세로 스크롤을 살린다.
//
// React.memo: 같은 card·children 이면 다른 카드/컬럼의 리렌더(메뉴 열기, 드래그
// 시작 등)에 끌려 재렌더하지 않는다. 드래그 중 카드는 isDragging 변화로만 갱신.
function BoardDraggableCardInner({
  card,
  children,
}: {
  card: BoardCard;
  children: ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.cardId}`,
    data: { card },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ touchAction: 'manipulation' }}
      // select-none/touch-callout: 길게 누르기(250ms) 활성화 중 iOS 텍스트 선택
      // 돋보기·콜아웃이 드래그와 겹쳐 뜨는 것을 막는다.
      className={cn('select-none [-webkit-touch-callout:none]', isDragging && 'opacity-30')}
      {...listeners}
    >
      {children}
    </div>
  );
}

// memo 는 카드 컴포넌트 자체의 리렌더만 방어한다. 현재 부모가 children 으로
// renderCard(card) 결과를 인라인 주입하므로 children 참조가 매 렌더 바뀌어 bail 은
// 미발현이다(동작 동일). 카드 데이터+안정 renderCard 패턴으로 가면 발현 — 후속 과제.
export const BoardDraggableCard = memo(BoardDraggableCardInner);
