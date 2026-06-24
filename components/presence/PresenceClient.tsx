'use client';

import { useEffect } from 'react';

import { getCentrifuge } from '@/lib/realtime/centrifuge-client';
import { managedSubscribe } from '@/lib/realtime/managedSubscribe';
import { presenceWsChannel } from '@/lib/realtime/channels';

/** Eagerly opens the WS and self-broadcasts this user's workspace presence.
 *  Renders nothing. No-op when realtime is unconfigured or the workspace is a
 *  demo/sample workspace (OV8 — demo members must not broadcast as online). */
export function PresenceClient({
  workspaceId,
  isDemo,
}: {
  workspaceId: string;
  isDemo: boolean;
}) {
  useEffect(() => {
    if (isDemo) return;
    const client = getCentrifuge();
    if (!client) return;
    const { dispose } = managedSubscribe(client, presenceWsChannel(workspaceId), {});
    client.connect();
    return dispose;
  }, [workspaceId, isDemo]);
  return null;
}
