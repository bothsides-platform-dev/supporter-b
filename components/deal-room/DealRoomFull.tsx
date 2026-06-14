import type { ReactNode } from 'react';

import { DealRoomShell } from './DealRoomShell';

type Props = {
  /** 사람용 코드 P-YYMM-NNNN */
  code: string;
  title: string;
  statusChip?: ReactNode;
  /** 우측 채팅 칼럼(상대방/팀). lg 이상에서만 노출. */
  chat?: ReactNode;
  /** 좌측 레일 + 가운데 탭(Buyer/PgDealRoomBody). */
  children: ReactNode;
};

/**
 * DealRoomFull — 정식 상세 페이지(새로고침·딥링크)에서 딜룸을 호스팅한다.
 *
 * 모달과 같은 `DealRoomShell`(mode='page')을 써 시각·기능을 일치시키되, 모달 전용
 * 크롬(닫기·전체화면·이전/다음)은 셸이 page 모드에서 생략한다.
 *
 * `(app)` 셸 main 은 `overflow-y-auto` 라, 여기서 `h-full min-h-0 overflow-hidden`
 * 로 감싸 내부 패널(센터 본문·채팅)이 스크롤을 소유하게 한다(이중 스크롤바 방지).
 */
export function DealRoomFull({ code, title, statusChip, chat, children }: Props) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <DealRoomShell mode="page" code={code} title={title} statusChip={statusChip} chat={chat}>
        {children}
      </DealRoomShell>
    </div>
  );
}
