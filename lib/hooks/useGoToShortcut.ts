'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
};

/**
 * useGoToShortcut — Linear-style "G then X" chord navigation.
 *
 * Press `g`, then within `windowMs` press a key in `map` to push that route.
 * Skips while focus is in an editable field, and ignores chords with modifiers
 * (so ⌘G / browser shortcuts aren't hijacked). `map` is read through a ref so
 * passing a fresh object each render doesn't resubscribe the listener.
 */
export function useGoToShortcut(
  map: Record<string, string>,
  windowMs = 1500,
) {
  const router = useRouter();
  const mapRef = useRef(map);
  useLayoutEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
      armed = false;
      if (timer) clearTimeout(timer);
    };

    const onKey = (e: KeyboardEvent) => {
      if (typeof e.key !== 'string') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      const key = e.key.toLowerCase();

      if (!armed) {
        if (key === 'g') {
          armed = true;
          timer = setTimeout(disarm, windowMs);
        }
        return;
      }

      disarm();
      const href = mapRef.current[key];
      if (href) {
        e.preventDefault();
        router.push(href);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
  }, [router, windowMs]);
}
