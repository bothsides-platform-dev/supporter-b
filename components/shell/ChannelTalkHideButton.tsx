'use client';

import { useEffect } from 'react';

export function ChannelTalkHideButton() {
  useEffect(() => {
    // Immediate call handles navigation into app routes after boot already ran
    window.ChannelIO?.('hideChannelButton');

    // Event listener handles cold load: boot is async, window.ChannelIO not yet set
    const onReady = () => window.ChannelIO?.('hideChannelButton');
    window.addEventListener('channelio:ready', onReady);

    return () => {
      window.removeEventListener('channelio:ready', onReady);
      window.ChannelIO?.('showChannelButton');
    };
  }, []);

  return null;
}
