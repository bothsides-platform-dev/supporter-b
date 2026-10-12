"use client";

import { siteConfig } from "@/lib/site-config";
import { channelTalkState } from "@/lib/channel-io/client";

export function DemoServiceContact() {
  return (
    <a
      onClick={(event) => {
        if (!channelTalkState.ready || !window.ChannelIO) return;
        try {
          window.ChannelIO("showMessenger");
          event.preventDefault();
        } catch {
          // Preserve the email link if the SDK is unavailable.
        }
      }}
      href={`mailto:${siteConfig.operator.email}`}
      className="inline-flex h-7 items-center rounded-[var(--md-sys-shape-small)] px-2 font-medium text-[length:var(--md-typescale-label-medium-size)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
    >
      서비스 문의
    </a>
  );
}
