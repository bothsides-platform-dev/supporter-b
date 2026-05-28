'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { KanbanBoard } from './KanbanBoard';
import { PipelineCard } from './PipelineCard';
import type { BoardCard, BoardColumn } from '@/lib/types/column';

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
    />
  );
}
