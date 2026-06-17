'use client';

/**
 * useChatChannel — live IM enhancement for one conversation thread.
 *
 * Subscribes to the conversation's Centrifugo channel (lifecycle shared via
 * useCentrifugoSubscription) and surfaces the three full-IM signals: incoming
 * messages/read-receipts (server publishes), typing indicators (client
 * ephemeral publishes), and counterparty online presence.
 *
 * Graceful no-op (load-bearing): when realtime is unconfigured the subscription
 * hook does nothing — no connect, no subscribe, no throw. It returns
 * `{ online:false, typingUserIds:[], sendTyping:no-op, connected:null }` and the
 * thread runs entirely off its static loader. The live path activates only when
 * NEXT_PUBLIC_CENTRIFUGO_WS_URL is set.
 *
 * Event identity model (see lib/server/realtime/centrifugo.ts):
 *   - `message` / `read` are SERVER-API publishes → no publisher ClientInfo;
 *     the relevant userId rides inside the payload (ctx.data).
 *   - `typing` is a CLIENT ephemeral publish → the typer's identity is on
 *     ctx.info.user; the payload is just { type:'typing' }.
 *
 * Presence + typing + sendTyping stay here (channel-specific); only the
 * connect/subscribe/cleanup boilerplate is shared with useTeamChannel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicationContext, Subscription } from 'centrifuge';

import { chatChannel } from '@/lib/server/realtime/centrifugo';
import { useCentrifugoSubscription } from '@/lib/hooks/useCentrifugoSubscription';

type ChatPayload = { type?: string; userId?: string; readAt?: string; [k: string]: unknown };

type UseChatChannelOptions = {
  onMessage?: (data: ChatPayload) => void;
  onRead?: (data: ChatPayload) => void;
};

export type UseChatChannelResult = {
  online: boolean;
  typingUserIds: string[];
  sendTyping: () => void;
  connected: boolean | null;
};

const TYPING_TIMEOUT_MS = 3000;

export function useChatChannel(
  conversationId: string,
  { onMessage, onRead }: UseChatChannelOptions,
): UseChatChannelResult {
  const [online, setOnline] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  // 구독 핸들 — presenceStats / typing publish 용. useCentrifugoSubscription 이 채움.
  const subRef = useRef<Subscription | null>(null);

  // Per-user typing-expiry timers; reset on each repeat typing event.
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Minimal presence: counterparty considered online when >= 2 unique users
  // (me + them) are in the channel. Best-effort; swallow transport errors.
  const refreshPresence = useCallback(() => {
    subRef.current
      ?.presenceStats()
      .then((stats) => setOnline(stats.numUsers >= 2))
      .catch(() => {});
  }, []);

  const { connected } = useCentrifugoSubscription(chatChannel(conversationId), {
    subRef,
    onPublication: (ctx: PublicationContext) => {
      const data = (ctx.data ?? {}) as ChatPayload;
      if (data.type === 'message') {
        onMessage?.(data);
      } else if (data.type === 'read') {
        onRead?.(data);
      } else if (data.type === 'typing') {
        const userId = ctx.info?.user;
        if (!userId) return;
        // reset the per-user expiry timer
        const existing = typingTimers.current.get(userId);
        if (existing) clearTimeout(existing);
        setTypingUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
        const timer = setTimeout(() => {
          typingTimers.current.delete(userId);
          setTypingUserIds((ids) => ids.filter((id) => id !== userId));
        }, TYPING_TIMEOUT_MS);
        typingTimers.current.set(userId, timer);
      }
    },
    onSubscribed: refreshPresence,
    onJoin: refreshPresence,
    onLeave: refreshPresence,
  });

  // 채널 전환·언마운트 시 진행 중 typing 타이머 정리(언마운트 후 setState 방지).
  useEffect(() => {
    const timers = typingTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [conversationId]);

  const sendTyping = useCallback(() => {
    // Client ephemeral publish. No userId in payload — the typer's identity is
    // attached by the SDK as publisher ClientInfo (ctx.info.user on receive).
    subRef.current?.publish({ type: 'typing' }).catch(() => {});
  }, []);

  return { online, typingUserIds, sendTyping, connected };
}
