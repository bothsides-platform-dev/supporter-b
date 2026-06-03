'use client';

/**
 * useChatChannel — live IM enhancement for one conversation thread.
 *
 * Subscribes to the conversation's Centrifugo channel and surfaces the three
 * full-IM signals: incoming messages/read-receipts (server publishes), typing
 * indicators (client ephemeral publishes), and counterparty online presence.
 *
 * Graceful no-op (load-bearing): when realtime is unconfigured the underlying
 * factory returns `null`, so this hook does nothing — no connect, no subscribe,
 * no throw. It returns `{ online:false, typingUserIds:[], sendTyping:no-op }`
 * and the thread runs entirely off its static loader. The live path activates
 * only when NEXT_PUBLIC_CENTRIFUGO_WS_URL is set.
 *
 * Event identity model (see lib/server/realtime/centrifugo.ts):
 *   - `message` / `read` are SERVER-API publishes → no publisher ClientInfo;
 *     the relevant userId rides inside the payload (ctx.data).
 *   - `typing` is a CLIENT ephemeral publish → the typer's identity is on
 *     ctx.info.user; the payload is just { type:'typing' }.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicationContext, Subscription } from 'centrifuge';

import { chatChannel } from '@/lib/server/realtime/centrifugo';
import { getCentrifuge } from '@/lib/realtime/centrifuge-client';

type ChatPayload = { type?: string; userId?: string; readAt?: string; [k: string]: unknown };

type UseChatChannelOptions = {
  onMessage?: (data: ChatPayload) => void;
  onRead?: (data: ChatPayload) => void;
};

export type UseChatChannelResult = {
  online: boolean;
  typingUserIds: string[];
  sendTyping: () => void;
};

const TYPING_TIMEOUT_MS = 3000;

export function useChatChannel(
  conversationId: string,
  { onMessage, onRead }: UseChatChannelOptions,
): UseChatChannelResult {
  const [online, setOnline] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const subRef = useRef<Subscription | null>(null);

  // Keep callbacks current without re-subscribing on every render.
  const onMessageRef = useRef(onMessage);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onReadRef.current = onRead;
  });

  // Per-user typing-expiry timers; reset on each repeat typing event.
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const client = getCentrifuge();
    // Unconfigured realtime → graceful no-op.
    if (!client) return;

    const channel = chatChannel(conversationId);
    const sub = client.getSubscription(channel) ?? client.newSubscription(channel);
    subRef.current = sub;

    const refreshPresence = () => {
      // Minimal presence: counterparty considered online when >= 2 unique users
      // (me + them) are in the channel. Best-effort; swallow transport errors.
      sub
        .presenceStats()
        .then((stats) => setOnline(stats.numUsers >= 2))
        .catch(() => {});
    };

    sub.on('publication', (ctx: PublicationContext) => {
      const data = (ctx.data ?? {}) as ChatPayload;
      if (data.type === 'message') {
        onMessageRef.current?.(data);
      } else if (data.type === 'read') {
        onReadRef.current?.(data);
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
    });

    sub.on('join', refreshPresence);
    sub.on('leave', refreshPresence);
    sub.on('subscribed', refreshPresence);

    sub.subscribe();
    client.connect();

    const timers = typingTimers.current;
    return () => {
      sub.unsubscribe();
      // unsubscribe() only changes state — the sub stays in the client registry.
      // Remove it so a remount of the same channel allocates a fresh sub via
      // newSubscription() instead of reusing this one and double-registering
      // handlers (which would fire onMessage/typing twice). Safe under the
      // single-consumer model (no ref-counted sharing).
      client.removeSubscription(sub);
      subRef.current = null;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [conversationId]);

  const sendTyping = useCallback(() => {
    // Client ephemeral publish. No userId in payload — the typer's identity is
    // attached by the SDK as publisher ClientInfo (ctx.info.user on receive).
    subRef.current?.publish({ type: 'typing' }).catch(() => {});
  }, []);

  return { online, typingUserIds, sendTyping };
}
