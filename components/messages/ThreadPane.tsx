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
}: {
  conversationId: string;
  counterpartyFallback: { workspaceId: string; name: string; type: 'buyer' | 'pg'; hasLogo: boolean };
  onBack?: () => void;
  /** ThreadView 변형 — 'rail' 은 상세 화면 우측 채팅 레일 임베드. */
  variant?: 'page' | 'rail';
  /** 레일 컨텍스트 RFP — 컴포저 전송에 기본 태그로 적용. */
  defaultRfpId?: string;
  rfpById?: Record<string, { code: string; title: string }>;
}) {
  const result = use(getThreadPromise(conversationId));
  const counterparty = result.ok ? result.counterparty : counterpartyFallback;
  const messages = result.ok ? result.messages : [];
  return (
    <ThreadView
      key={conversationId}
      conversationId={conversationId}
      counterparty={counterparty}
      messages={messages}
      onBack={onBack}
      variant={variant}
      defaultRfpId={defaultRfpId}
      rfpById={rfpById}
    />
  );
}
