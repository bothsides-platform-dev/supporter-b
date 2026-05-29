'use client';

import { useEffect } from 'react';

export function ChannelTalkHideButton() {
  useEffect(() => {
    // Re-hide the FAB whenever the messenger is closed. Opening the messenger
    // (sidebar 문의하기 → showMessenger) makes Channel.io reveal its launcher
    // button; without this the FAB lingers after close instead of disappearing.
    const hideOnClose = () => window.ChannelIO?.('hideChannelButton');

    // Immediate call handles navigation into app routes after boot already ran
    window.ChannelIO?.('hideChannelButton');
    window.ChannelIO?.('onHideMessenger', hideOnClose);

    // Event listener handles cold load: boot is async, window.ChannelIO not yet set
    const onReady = () => {
      window.ChannelIO?.('hideChannelButton');
      window.ChannelIO?.('onHideMessenger', hideOnClose);
    };
    window.addEventListener('channelio:ready', onReady);

    return () => {
      window.removeEventListener('channelio:ready', onReady);
      window.ChannelIO?.('showChannelButton');
    };
  }, []);

  return null;
}
