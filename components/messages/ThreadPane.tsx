'use client';

import { use } from 'react';
import { getThreadPromise } from './thread-cache';
import { ThreadView } from './ThreadView';

export function ThreadPane({
  conversationId,
  counterpartyFallback,
  onBack,
  variant,
  defaultRfpId,
  rfpById,
  rfpContext,
  sendDisabled,
}: {
  conversationId: string;
  counterpartyFallback: { workspaceId: string; name: string; type: 'buyer' | 'pg'; hasLogo: boolean };
  onBack?: () => void;
  /** ThreadView 변형 — 'rail' 은 상세 화면 우측 채팅 레일 임베드. */
  variant?: 'page' | 'rail';
  /** 레일 컨텍스트 RFP — 컴포저 전송에 기본 태그로 적용. */
  defaultRfpId?: string;
  rfpById?: Record<string, { code: string; title: string }>;
  /** tabs 변형에서 RFP 탭에 표시할 컨텍스트 정보. */
  rfpContext?: { code: string; title: string; status?: string; deadline?: string | null };
  /** 샘플 RFP — 컴포저 전송 차단(데모 PG 에게 실제 전송 방지). */
  sendDisabled?: boolean;
}) {
  const result = use(getThreadPromise(conversationId));
  const counterparty = result.ok ? result.counterparty : counterpartyFallback;
  const messages = result.ok ? result.messages : [];
  const viewer = result.ok ? result.viewer : { userId: '', name: '' };
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
