'use client';

/**
 * DealRoomChat — 딜룸 모달 우측 채팅 호스트.
 *
 * ChatPanel 을 sticky/aside/open-gate 없이 직접 마운트한다.
 *   - PG 측은 상대(구매사)가 고정이라 fixedCounterparty 를 DealRoom 컨텍스트에 시드한다.
 *     구매사 측은 가운데 FocusComparison 이 포커스 PG 를 set 하므로 시드하지 않는다.
 *   - 딜룸 간 상대 누수는 DealRoomProvider 가 code 별로 마운트(key)해 자동 차단한다
 *     (이전의 unmount-reset 불필요).
 */
import { useEffect } from 'react';

import { useDealRoom, type DealRoomCounterparty } from './DealRoomContext';
import { ChatPanel } from '@/components/messages/ChatPanel';

type Props = {
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  isSample?: boolean;
  /** PG 측: 상대(구매사) 고정 시드. 구매사 측은 생략. */
  fixedCounterparty?: DealRoomCounterparty;
  /** 선정 종료로 대화를 닫을 상대 워크스페이스 ID 목록(ChatPanel 로 전달). */
  closedCounterpartyIds?: string[];
};

export function DealRoomChat({
  rfpId,
  rfpCode,
  rfpTitle,
  isSample = false,
  fixedCounterparty,
  closedCounterpartyIds,
}: Props) {
  const { setCounterparty } = useDealRoom();

  const fixedWsId = fixedCounterparty?.workspaceId;
  const fixedLogoTs = fixedCounterparty?.logoUpdatedAt;
  useEffect(() => {
    if (fixedCounterparty) setCounterparty(fixedCounterparty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 원시값(wsId·logoTs)으로 추적해 inline 객체 재생성 무시
  }, [fixedWsId, fixedLogoTs, setCounterparty]);

  return (
    <ChatPanel
      rfpId={rfpId}
      rfpCode={rfpCode}
      rfpTitle={rfpTitle}
      isSample={isSample}
      closedCounterpartyIds={closedCounterpartyIds}
    />
  );
}
