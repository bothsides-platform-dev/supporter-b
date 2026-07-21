'use client';

/**
 * 상대 워크스페이스와의 대화를 보장하고 메시지로 이동한다. 선정 결과 화면
 * (AwardResult)과 계약 탭 컨텍스트 줄(AwardContextLine)이 공유한다.
 * 실패·throw 시에도 사용자를 LOADING… 에 가두지 않고 메시지 목록으로 보낸다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';

export function useStartConversation() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const start = async (counterpartyWsId: string) => {
    if (starting) return;
    setStarting(true);
    try {
      const r = await getOrCreateConversationAction(counterpartyWsId);
      if (r.ok) {
        router.push(`/messages?c=${r.conversationId}`);
        return;
      }
    } catch {
      // 액션이 throw 해도 사용자를 LOADING… 에 가두지 않는다.
    }
    setStarting(false);
    router.push('/messages');
  };

  return { starting, start };
}
