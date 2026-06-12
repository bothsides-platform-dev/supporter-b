'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { KanbanBoard } from './KanbanBoard';
import { PipelineCard } from './PipelineCard';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

// 종결 컬럼은 시간이 지나면 무한 누적 — 보드에는 최근 N장만 두고 전체 조회는
// 이미 있는 표 뷰의 status 필터 딥링크로 위임한다.
const RESULT_COLUMN_LIMIT = 10;

function resultColumnOverflow(
  cardType: 'rfp' | 'invitation',
  lifecycleKey: string | null,
): { limit: number; moreHref: string } | null {
  if (cardType === 'rfp') {
    if (lifecycleKey === 'closed')
      return { limit: RESULT_COLUMN_LIMIT, moreHref: '/rfp?view=table&status=closed' };
    if (lifecycleKey === 'awarded')
      return { limit: RESULT_COLUMN_LIMIT, moreHref: '/rfp?view=table&status=awarded' };
    return null;
  }
  // invitation — 표의 '마감' 필터가 won/lost 를 함께 폴드한다.
  if (lifecycleKey === 'won' || lifecycleKey === 'lost')
    return { limit: RESULT_COLUMN_LIMIT, moreHref: '/inbox?view=table&status=closed' };
  return null;
}

// Client wrapper for the home pipeline board: supplies renderCard (navigation
// needs useRouter, which the server home components can't provide).
export function PipelineBoard({
  cardType,
  columns,
  cards,
}: {
  cardType: 'rfp' | 'invitation';
  columns: BoardColumn[];
  cards: BoardCard[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleCardSelect(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('peek', code);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <KanbanBoard
      kind="pipeline"
      cardType={cardType}
      columns={columns}
      cards={cards}
      renderCard={(card) => {
        const code = (card.payload as { rfpId: string }).rfpId;
        return <PipelineCard card={card} onSelect={() => handleCardSelect(code)} />;
      }}
      columnOverflow={(column) => resultColumnOverflow(cardType, column.lifecycleKey)}
    />
  );
}
