'use client';

import { useEffect } from 'react';

import { getCentrifuge } from '@/lib/realtime/centrifuge-client';
import { managedSubscribe } from '@/lib/realtime/managedSubscribe';
import { presenceWsChannel } from '@/lib/realtime/channels';

/** Eagerly opens the WS and self-broadcasts this user's workspace presence.
 *  Renders nothing. No-op when realtime is unconfigured. */
export function PresenceClient({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    const client = getCentrifuge();
    if (!client) return;
    const { dispose } = managedSubscribe(client, presenceWsChannel(workspaceId), {});
    client.connect();
    return dispose;
  }, [workspaceId]);
  return null;
}
