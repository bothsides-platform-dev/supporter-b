import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';

/**
 * 오픈게시판 kill switch(OPEN_BOARD_ENABLED=false) 동안 /opportunities 직접
 * 진입 시 보여주는 준비중 화면. 보드 데이터는 노출하지 않는다.
 */
export function OpportunitiesUnavailable() {
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <EmptyState
        icon={<InboxIcon size={32} />}
        title="참여 가능한 견적을 잠시 닫았어요"
        description="곧 다시 열릴 예정이에요."
      />
    </div>
  );
}
