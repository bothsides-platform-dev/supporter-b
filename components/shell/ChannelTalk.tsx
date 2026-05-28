'use client';

import { useEffect } from 'react';
import type { ChannelMember } from '@/lib/channel-io/server';

type Props = {
  pluginKey?: string;
  member: ChannelMember | null;
};

export function ChannelTalk({ pluginKey, member }: Props) {
  const memberId = member?.memberId;
  const memberHash = member?.memberHash;
  const profileName = member?.profile.name ?? null;
  const profileEmail = member?.profile.email ?? null;

  useEffect(() => {
    if (!pluginKey) return;
    let cancelled = false;
    let mod: typeof import('@channel.io/channel-web-sdk-loader') | null = null;

    (async () => {
      mod = await import('@channel.io/channel-web-sdk-loader');
      if (cancelled) return;
      mod.loadScript();
      mod.shutdown();
      mod.boot({
        pluginKey,
        language: 'ko',
        zIndex: 40,
        ...(memberId && profileEmail
          ? {
              memberId,
              memberHash,
              profile: { name: profileName, email: profileEmail },
            }
          : {}),
      });
      window.dispatchEvent(new CustomEvent('channelio:ready'));
    })();

    return () => {
      cancelled = true;
      mod?.shutdown();
    };
  }, [pluginKey, memberId, memberHash, profileName, profileEmail]);

  return null;
}
