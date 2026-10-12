"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { channelTalkState } from "@/lib/channel-io/client";
import type { ChannelMember } from "@/lib/channel-io/server";

type Props = {
  pluginKey?: string;
  member: ChannelMember | null;
};

export function ChannelTalk({ pluginKey, member }: Props) {
  const isDemo = usePathname() === "/demo";
  const memberId = member?.memberId;
  const memberHash = member?.memberHash;
  const profileName = member?.profile.name ?? null;
  const profileEmail = member?.profile.email ?? null;

  useEffect(() => {
    channelTalkState.ready = false;
    if (!pluginKey) return;
    let cancelled = false;
    let mod: typeof import("@channel.io/channel-web-sdk-loader") | null = null;

    (async () => {
      mod = await import("@channel.io/channel-web-sdk-loader");
      if (cancelled) return;
      mod.loadScript();
      mod.hideMessenger();
      mod.shutdown();
      mod.boot(
        {
          pluginKey,
          language: "ko",
          zIndex: 40,
          hideChannelButtonOnBoot: isDemo,
          hidePopup: isDemo,
          ...(memberId && profileEmail
            ? {
                memberId,
                memberHash,
                profile: { name: profileName, email: profileEmail },
              }
            : {}),
        },
        (error) => {
          if (cancelled || error) return;
          channelTalkState.ready = true;
          if (isDemo) {
            mod?.hideChannelButton();
            mod?.onHideMessenger(() => {
              if (!cancelled) mod?.hideChannelButton();
            });
          }
          window.dispatchEvent(new CustomEvent("channelio:ready"));
        },
      );
    })().catch(() => {
      // SDK loading failure leaves the service contact email available.
    });

    return () => {
      cancelled = true;
      channelTalkState.ready = false;
      mod?.shutdown();
    };
  }, [isDemo, pluginKey, memberId, memberHash, profileName, profileEmail]);

  return null;
}
