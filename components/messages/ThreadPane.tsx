'use client';

import { use, useEffect } from 'react';
import { getThreadPromise, invalidateThread } from './thread-cache';
import { ThreadView } from './ThreadView';

export function ThreadPane({
  conversationId,
  counterpartyFallback,
  onBack,
  variant,
  defaultRfpId,
  rfpContext,
  sendDisabled,
}: {
  conversationId: string;
  counterpartyFallback: { workspaceId: string; name: string; type: 'buyer' | 'pg'; hasLogo: boolean };
  onBack?: () => void;
  /** ThreadView 변형 — 'rail' 은 상세 화면 우측 채팅 레일 임베드, 'tabs' 는 md 폭 탭 전환. */
  variant?: 'page' | 'rail' | 'tabs';
  /** 레일 컨텍스트 RFP — 컴포저 전송에 기본 태그로 적용. */
  defaultRfpId?: string;
  /** tabs 변형에서 RFP 탭에 표시할 컨텍스트 정보. */
  rfpContext?: { code: string; title: string; status?: string; deadline?: string | null };
  /** 샘플 RFP — 컴포저 전송 차단(데모 PG 에게 실제 전송 방지). */
  sendDisabled?: boolean;
}) {
  // unmount/conversationId 변경 시 캐시 무효화 → 재진입마다 신선한 스레드.
  // TeamThreadPane 의 동일 패턴 이식(team-thread-cache.ts invalidateTeamThread).
  useEffect(() => () => invalidateThread(conversationId), [conversationId]);

  const result = use(getThreadPromise(conversationId));
  const counterparty = result.ok ? result.counterparty : counterpartyFallback;
  const messages = result.ok ? result.messages : [];
  const viewer = result.ok ? result.viewer : { userId: '', name: '' };
  const rfpById = result.ok ? result.rfpById : undefined;
  return (
    <ThreadView
      key={conversationId}
      conversationId={conversationId}
      counterparty={counterparty}
      viewer={viewer}
      messages={messages}
      onBack={onBack}
      variant={variant}
      defaultRfpId={defaultRfpId}
      rfpById={rfpById}
      rfpContext={rfpContext}
      sendDisabled={sendDisabled}
    />
  );
}
