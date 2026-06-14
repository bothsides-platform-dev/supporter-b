'use client';

/**
 * useTeamChannel — live enhancement for one RFP-scoped internal team thread.
 *
 * Deliberately a separate, much smaller hook than useChatChannel: the team
 * thread has messages only (no typing / presence / read receipts — v1 확정
 * 결정), so reusing the conversation hook would drag those semantics along.
 *
 * Graceful no-op (load-bearing): when realtime is unconfigured the underlying
 * factory returns `null`, so this hook does nothing — no connect, no
 * subscribe, no throw. The thread runs entirely off its static loader. The
 * live path activates only when NEXT_PUBLIC_CENTRIFUGO_WS_URL is set.
 */
import { useEffect, useRef, useState } from 'react';
import type { PublicationContext } from 'centrifuge';

import { teamChatChannel } from '@/lib/server/realtime/centrifugo';
import { getCentrifuge } from '@/lib/realtime/centrifuge-client';

export type TeamLivePayload = {
  type?: string;
  id?: string;
  body?: string;
  authorUserId?: string;
  authorName?: string;
  createdAt?: string;
  attachments?: import('@/lib/types/common').Attachment[];
  [k: string]: unknown;
};

type UseTeamChannelOptions = {
  onMessage?: (data: TeamLivePayload) => void;
};

export type UseTeamChannelResult = {
  connected: boolean | null;
};

export function useTeamChannel(
  rfpId: string,
  workspaceId: string,
  { onMessage }: UseTeamChannelOptions,
): UseTeamChannelResult {
  const [connected, setConnected] = useState<boolean | null>(null);

  // Keep the callback current without re-subscribing on every render.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const client = getCentrifuge();
    // Unconfigured realtime → graceful no-op.
    if (!client) return;

    const channel = teamChatChannel(rfpId, workspaceId);
    const sub = client.getSubscription(channel) ?? client.newSubscription(channel);

    sub.on('publication', (ctx: PublicationContext) => {
      const data = (ctx.data ?? {}) as TeamLivePayload;
      if (data.type === 'message') onMessageRef.current?.(data);
    });

    const onConnected = () => setConnected(true);
    const onDisconnected = () => setConnected(false);
    client.on('connected', onConnected);
    client.on('disconnected', onDisconnected);

    sub.subscribe();
    client.connect();

    return () => {
      sub.unsubscribe();
      // unsubscribe() only changes state — the sub stays in the client
      // registry. Remove it so a remount of the same channel allocates a fresh
      // sub via newSubscription() instead of reusing this one and
      // double-registering handlers (which would fire onMessage twice). Safe
      // under the single-consumer model (no ref-counted sharing).
      client.removeSubscription(sub);
      client.off('connected', onConnected);
      client.off('disconnected', onDisconnected);
    };
  }, [rfpId, workspaceId]);

  return { connected };
}
