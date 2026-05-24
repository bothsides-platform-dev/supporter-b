'use client';

import { ModifierShortcut } from '@/components/ui/ModifierShortcut';
import { Kbd } from '@/components/ui/Kbd';
import { useIsMac } from '@/lib/hooks/usePlatform';
import type { NavShortcut } from '@/lib/nav/nav-config';

type ShortcutHintProps = {
  shortcut: NavShortcut;
};

/**
 * ShortcutHint — renders a NavShortcut as keycap(s). Chords show two caps
 * ("G" "H", Linear-style); modifier combos show separate keycaps (⌘ K / Ctrl K).
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

  return <ModifierShortcut shortcutKey={shortcut.key} isMac={isMac} />;
}
