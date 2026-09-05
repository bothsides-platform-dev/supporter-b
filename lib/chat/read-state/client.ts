'use client';

import { useCallback, useMemo, useState } from 'react';

import type { ChatReadEvent } from './event';

type ReceiptMessage = {
  id: string;
  sender: 'self' | 'other';
  createdAt: string;
  readByCounterparty: boolean;
};

export function useConversationReadReceipt(input: {
  conversationId: string;
  counterpartyWorkspaceId: string;
  messages: ReceiptMessage[];
}): {
  accept: (event: ChatReadEvent) => void;
  receiptMessageId: string | null;
} {
  const identity = `${input.conversationId}:${input.counterpartyWorkspaceId}`;
  const [live, setLive] = useState({ identity, readAt: 0 });
  if (live.identity !== identity) {
    setLive({ identity, readAt: 0 });
  }

  const accept = useCallback(
    (event: ChatReadEvent) => {
      if (event.workspaceId !== input.counterpartyWorkspaceId) return;
      const nextReadAt = Date.parse(event.readAt);
      if (!Number.isFinite(nextReadAt)) return;
      setLive((current) => ({
        identity,
        readAt: Math.max(current.identity === identity ? current.readAt : 0, nextReadAt),
      }));
    },
    [identity, input.counterpartyWorkspaceId],
  );

  const receiptMessageId = useMemo(() => {
    const index = input.messages.findLastIndex(
      (message) =>
        message.sender === 'self' &&
        (message.readByCounterparty ||
          Date.parse(message.createdAt) <=
            (live.identity === identity ? live.readAt : 0)),
    );
    return index < 0 ? null : input.messages[index].id;
  }, [identity, input.messages, live]);

  return { accept, receiptMessageId };
}
