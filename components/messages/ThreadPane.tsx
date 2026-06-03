'use client';

import { use } from 'react';
import { getThreadPromise } from './thread-cache';
import { ThreadView } from './ThreadView';

export function ThreadPane({
  conversationId,
  counterpartyFallback,
}: {
  conversationId: string;
  counterpartyFallback: { workspaceId: string; name: string; type: 'buyer' | 'pg'; hasLogo: boolean };
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
    />
  );
}
