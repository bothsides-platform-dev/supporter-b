'use client';

/**
 * DealRoomChat — 딜룸 모달 우측 채팅 호스트.
 *
 * ChatPanel 을 sticky/aside/open-gate 없이 직접 마운트하고, ChatRail 이 맡던
 * 스토어 수명만 대신 담당한다:
 *   - PG 측은 상대(구매사)가 고정이라 fixedCounterparty 를 시드한다. 구매사 측은
 *     가운데 FocusComparison 이 포커스 PG 를 publish 하므로 시드하지 않는다.
 *   - 모달 닫힘(unmount) 시 스토어를 reset 해 다음 딜룸으로 상대가 새지 않게 한다.
 */
import { useEffect } from 'react';

import {
  useChatRailStore,
  type ChatRailCounterparty,
} from '@/lib/stores/chat-rail';
import { ChatPanel } from '@/components/messages/ChatPanel';

type Props = {
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  isSample?: boolean;
  /** PG 측: 상대(구매사) 고정 시드. 구매사 측은 생략. */
  fixedCounterparty?: ChatRailCounterparty;
};

export function DealRoomChat({
  rfpId,
  rfpCode,
  rfpTitle,
  isSample = false,
  fixedCounterparty,
}: Props) {
  const setCounterparty = useChatRailStore((s) => s.setCounterparty);

  const fixedWsId = fixedCounterparty?.workspaceId;
  useEffect(() => {
    if (fixedCounterparty) setCounterparty(fixedCounterparty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wsId 로 추적
  }, [fixedWsId, setCounterparty]);

  useEffect(() => () => useChatRailStore.getState().reset(), []);

  return (
    <ChatPanel
      rfpId={rfpId}
      rfpCode={rfpCode}
      rfpTitle={rfpTitle}
      isSample={isSample}
    />
  );
}
