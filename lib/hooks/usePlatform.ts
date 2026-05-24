import * as React from 'react';

type NavLike = { platform?: string; userAgent?: string };

// True when the running platform is Apple (macOS / iOS) — used to choose the
// ⌘ glyph over Ctrl in keyboard-shortcut hints. Pure + arg-injectable so it's
// testable without a DOM.
export function isMacPlatform(nav?: NavLike): boolean {
  if (!nav) return false;
  const hay = `${nav.platform ?? ''} ${nav.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(hay);
}

// Split a modifier combo into separate keycap labels (⌘ + K, Ctrl + K).
export function getModifierShortcutParts(
  key: string,
  isMac: boolean,
): { modifier: string; key: string } {
  return {
    modifier: isMac ? '⌘' : 'Ctrl',
    key: key.toUpperCase(),
  };
}

function getSnapshot(): boolean {
  return isMacPlatform(typeof navigator !== 'undefined' ? navigator : undefined);
}

function getServerSnapshot(): boolean {
  return false; // Windows-majority audience; Mac clients swap on first paint.
}

function subscribe(): () => void {
  return () => {}; // OS doesn't change at runtime — nothing to subscribe to.
}

export function useIsMac(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
