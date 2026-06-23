'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

import { isEditable } from './keyboard-utils';

export type ShortcutOptions = {
  meta?: boolean; // ⌘ (mac) or Ctrl (win/linux)
  shift?: boolean;
  preventInInput?: boolean; // skip when focus is on input/textarea/contenteditable
};

export function useShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  opts: ShortcutOptions = {},
) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const { meta, shift, preventInInput } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Synthetic keyboard events (Sentry instrumentation, IME composition,
      // some browser-extension dispatches) can arrive without a `key` field
      // even though the type says string — guard before .toLowerCase().
      if (typeof e.key !== 'string') return;
      const isEscape = e.key === 'Escape';
      if (preventInInput !== false && isEditable(e.target) && !isEscape) return;
      if (!isEscape) {
        if (meta && !(e.metaKey || e.ctrlKey)) return;
        if (!meta && (e.metaKey || e.ctrlKey)) return;
      }
      if (shift !== undefined && shift !== e.shiftKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      handlerRef.current(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [key, meta, shift, preventInInput]);
}
