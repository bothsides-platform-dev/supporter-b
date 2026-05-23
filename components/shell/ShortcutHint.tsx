'use client';

import { Kbd } from '@/components/ui/Kbd';
import { useIsMac, formatModifierShortcut } from '@/lib/hooks/usePlatform';
import type { NavShortcut } from '@/lib/nav/nav-config';

type ShortcutHintProps = {
  shortcut: NavShortcut;
};

/**
 * ShortcutHint — renders a NavShortcut as keycap(s). Chords show two caps
 * ("G" "H", Linear-style); modifier combos show one platform-aware cap (⌘K / Ctrl+K).
 */
export function ShortcutHint({ shortcut }: ShortcutHintProps) {
  const isMac = useIsMac();

  if (shortcut.kind === 'chord') {
    return (
      <span className="inline-flex items-center gap-1">
        <Kbd>{shortcut.lead.toUpperCase()}</Kbd>
        <Kbd>{shortcut.key.toUpperCase()}</Kbd>
      </span>
    );
  }

  return <Kbd>{formatModifierShortcut(shortcut.key, isMac)}</Kbd>;
}
