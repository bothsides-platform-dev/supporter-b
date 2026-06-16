'use client';

import { useEffect, useState } from 'react';
import { lookupConversationAction } from '@/lib/server/actions/chat/lookupConversationAction';

// wsId → conversationId 읽기 전용 해소 캐시. 열람만으로 대화를 생성하지 않는다
// (sealed-bid: 관심 신호 차단) — 생성은 첫 전송에만. 실패는 wsId 단위로 기록해 무한
// 스켈레톤 대신 에러 빈 상태를 보여준다.
//
// conversationId: undefined=해소 중, null="대화 없음"(새 대화 컴포저), string=해소됨.
export function useConversationLookup(
  activeWsId: string | undefined,
  enabled: boolean,
): {
  conversationId: string | null | undefined;
  resolveFailed: boolean;
  retry: () => void;
  markCreated: (wsId: string, conversationId: string) => void;
} {
  const [convByWs, setConvByWs] = useState<Record<string, string | null>>({});
  const [failedWs, setFailedWs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!enabled || !activeWsId) return;
    if (convByWs[activeWsId] !== undefined || failedWs[activeWsId]) return;
    let cancelled = false;
    void lookupConversationAction(activeWsId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFailedWs((prev) => ({ ...prev, [activeWsId]: true }));
          return;
        }
        setConvByWs((prev) => ({ ...prev, [activeWsId]: r.conversationId }));
      })
      .catch(() => {
        if (!cancelled) setFailedWs((prev) => ({ ...prev, [activeWsId]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, activeWsId, convByWs, failedWs]);

  const conversationId = activeWsId ? convByWs[activeWsId] : undefined;
  const resolveFailed = activeWsId ? !!failedWs[activeWsId] : false;

  const retry = (): void => {
    if (activeWsId) setFailedWs((prev) => ({ ...prev, [activeWsId]: false }));
  };
  const markCreated = (wsId: string, conversationId: string): void => {
    setConvByWs((prev) => ({ ...prev, [wsId]: conversationId }));
  };

  return { conversationId, resolveFailed, retry, markCreated };
}
