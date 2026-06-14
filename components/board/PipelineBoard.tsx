'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { KanbanBoard } from './KanbanBoard';
import { PipelineCard } from './PipelineCard';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

// 종결 컬럼은 시간이 지나면 무한 누적 — 보드에는 최근 N장만 두고 전체 조회는
// 이미 있는 표 뷰의 status 필터 딥링크로 위임한다.
const RESULT_COLUMN_LIMIT = 10;

// 딥링크는 현재 보드의 deadline/grade 필터를 보존해 도착지 모집단을 보드와 맞춘다
// (peek 등 나머지 파라미터는 버림).
function tableDeepLink(
  pathname: '/rfp' | '/inbox',
  status: string,
  current: URLSearchParams,
): string {
  const params = new URLSearchParams();
  const deadline = current.get('deadline');
  const grade = current.get('grade');
  if (deadline) params.set('deadline', deadline);
  if (grade) params.set('grade', grade);
  params.set('view', 'table');
  params.set('status', status);
  return `${pathname}?${params.toString()}`;
}

function resultColumnOverflow(
  cardType: 'rfp' | 'invitation',
  lifecycleKey: string | null,
  current: URLSearchParams,
): { limit: number; moreHref: string } | null {
  if (cardType === 'rfp') {
    // 표의 'closed' 토큰은 cancelled 를 폴드 (status-filter.ts) — 마감 컬럼 모집단과 일치.
    if (lifecycleKey === 'closed')
      return { limit: RESULT_COLUMN_LIMIT, moreHref: tableDeepLink('/rfp', 'closed', current) };
    if (lifecycleKey === 'awarded')
      return { limit: RESULT_COLUMN_LIMIT, moreHref: tableDeepLink('/rfp', 'awarded', current) };
    return null;
  }
  // invitation — 표의 '마감' 필터가 won/lost 를 함께 폴드한다.
  if (lifecycleKey === 'won' || lifecycleKey === 'lost')
    return { limit: RESULT_COLUMN_LIMIT, moreHref: tableDeepLink('/inbox', 'closed', current) };
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

  // 카드 클릭 → 상세 라우트로 push → 인터셉트 딜룸 모달(표 뷰 행 클릭과 동일).
  // pathname 은 보드 뷰가 사는 '/rfp' | '/inbox' — 같은 세그먼트라 인터셉트된다.
  // (과거 ?peek 사이드 패널은 제거됨.)
  function handleCardSelect(code: string) {
    router.push(`${pathname}/${code}`);
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
      columnOverflow={(column) =>
        resultColumnOverflow(cardType, column.lifecycleKey, searchParams)
      }
    />
  );
}
