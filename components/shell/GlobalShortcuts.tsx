'use client';

import { useShortcut } from '@/lib/hooks/useShortcut';
import { useUIStore } from '@/lib/stores/ui';

export function GlobalShortcuts() {
  const closePalette = useUIStore((s) => s.closeCommandPalette);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);

  // 새 RFP (⌘N) was removed: the browser claims ⌘N for "new window" and JS
  // can't intercept it. Creation is now the "G then C" chord (see nav-config).
  useShortcut('Escape', () => {
    if (paletteOpen) closePalette();
  }, { preventInInput: false });

  return null;
}
