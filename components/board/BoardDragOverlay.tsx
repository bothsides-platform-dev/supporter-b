'use client';

import { type ReactNode } from 'react';
import { DragOverlay } from '@dnd-kit/core';
import type { BoardCard } from '@/lib/types/column';

// 드래그 중인 카드의 따라다니는 시각 사본. 원본 카드는 자리 placeholder 로만 남고
// (opacity-30) 실제 이동 표현은 이 오버레이가 담당한다.
export function BoardDragOverlay({
  activeCard,
  renderCard,
}: {
  activeCard: BoardCard | null;
  renderCard: (card: BoardCard) => ReactNode;
}) {
  return (
    <DragOverlay>
      {activeCard ? (
        // 컬럼 w-72(288px) − p-3 양쪽(24px) = 카드 실폭 264px.
        <div className="w-[264px]">{renderCard(activeCard)}</div>
      ) : null}
    </DragOverlay>
  );
}
