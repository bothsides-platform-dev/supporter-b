import { Kbd } from '@/components/primitives/Kbd';
import { getModifierShortcutParts } from '@/lib/hooks/usePlatform';
import { cn } from '@/lib/utils';

type ModifierShortcutProps = {
  shortcutKey: string;
  isMac: boolean;
  className?: string;
};

/**
 * ModifierShortcut — platform-aware modifier combo as separate keycaps (⌘ K / Ctrl K).
 */
export function ModifierShortcut({
  shortcutKey,
  isMac,
  className,
}: ModifierShortcutProps) {
  const { modifier, key } = getModifierShortcutParts(shortcutKey, isMac);

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Kbd>{modifier}</Kbd>
      <Kbd>{key}</Kbd>
    </span>
  );
}
