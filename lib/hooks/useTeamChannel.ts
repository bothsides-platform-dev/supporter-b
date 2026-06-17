'use client';

/**
 * useTeamChannel — live enhancement for one RFP-scoped internal team thread.
 *
 * Messages only — no typing / presence / read receipts (v1 확정 결정). The
 * Centrifugo subscription lifecycle is shared via useCentrifugoSubscription;
 * this hook only maps the channel + routes message publications.
 *
 * Graceful no-op (load-bearing): when realtime is unconfigured the subscription
 * hook does nothing — the thread runs entirely off its static loader. The live
 * path activates only when NEXT_PUBLIC_CENTRIFUGO_WS_URL is set.
 */
import type { PublicationContext } from 'centrifuge';

import { teamChatChannel } from '@/lib/server/realtime/centrifugo';
import { useCentrifugoSubscription } from '@/lib/hooks/useCentrifugoSubscription';

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
  const { connected } = useCentrifugoSubscription(teamChatChannel(rfpId, workspaceId), {
    onPublication: (ctx: PublicationContext) => {
      const data = (ctx.data ?? {}) as TeamLivePayload;
      if (data.type === 'message') onMessage?.(data);
    },
  });

  return { connected };
}
