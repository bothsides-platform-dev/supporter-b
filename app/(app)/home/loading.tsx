import { KanbanBoardSkeleton } from '@/components/board/KanbanBoard';

export default function Loading() {
  return (
    <div className="px-8 py-10">
      <KanbanBoardSkeleton />
    </div>
  );
}
