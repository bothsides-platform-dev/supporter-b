'use client';

import { Chip } from '@/components/primitives/Chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * 구매사 RFP 오픈 게시판 노출 상태 — 읽기전용.
 *
 * board_visible 값을 Chip + hover Tooltip 으로 표시한다.
 * 변경은 불가 — 오픈 게시판 노출 여부는 처음 견적 요청 작성 시에만 선택 가능하다.
 */
export function RfpBoardVisibilityStatus({ boardVisible }: { boardVisible: boolean }) {
  const chipLabel = boardVisible ? '게시판 노출 중' : '게시판 비노출';
  const description = boardVisible
    ? '다른 PG사가 이 견적 요청을 발견하고 참여를 요청할 수 있어요.'
    : '게시판에서 숨겨져 초대한 PG사만 볼 수 있어요.';

  return (
    <TooltipProvider>
      <Tooltip>
        {/* title 속성으로 스크린리더/테스트 접근성 확보 */}
        <TooltipTrigger render={<span title={description} className="cursor-default" />}>
          <Chip label={chipLabel} color={boardVisible ? 'tertiary' : 'surface'} />
        </TooltipTrigger>
        <TooltipContent side="top">{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
