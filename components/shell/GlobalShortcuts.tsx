'use client';

import { useRouter } from 'next/navigation';
import { useShortcut } from '@/lib/hooks/useShortcut';
import { useUIStore } from '@/lib/stores/ui';

export function GlobalShortcuts() {
  const router = useRouter();
  const closePalette = useUIStore((s) => s.closeCommandPalette);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);

  useShortcut('n', (e) => {
    e.preventDefault();
    if (paletteOpen) closePalette();
    router.push('/rfp/new');
  }, { meta: true, preventInInput: false });

  useShortcut('Escape', () => {
    if (paletteOpen) closePalette();
  }, { preventInInput: false });

  return null;
}
