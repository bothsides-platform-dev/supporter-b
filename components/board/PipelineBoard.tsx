'use client';

import { useRouter } from 'next/navigation';
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
  return (
    <KanbanBoard
      kind="pipeline"
      cardType={cardType}
      columns={columns}
      cards={cards}
      renderCard={(card) => {
        const code = (card.payload as { rfpId: string }).rfpId;
        const href = cardType === 'rfp' ? `/rfp/${code}` : `/inbox/${code}`;
        return <PipelineCard card={card} onSelect={() => router.push(href)} />;
      }}
    />
  );
}
