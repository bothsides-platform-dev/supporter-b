'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useNavHistoryStore } from '@/lib/stores/nav-history';

/**
 * Feeds the in-app navigation stack ([[nav-history]]) on every route change so
 * the header `‹ ›` buttons stay inside our service and disable at the edges.
 * Renders nothing — mount it once in the app shell, inside a <Suspense> boundary
 * (it reads useSearchParams). Resets the stack on unmount so an app↔public
 * transition (logout/login) doesn't leak a stale, escapable history.
 */
export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const poppedRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      poppedRef.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const search = searchParams.toString();
  const url = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    useNavHistoryStore.getState().sync(url, poppedRef.current);
    poppedRef.current = false;
  }, [url]);

  useEffect(() => {
    return () => useNavHistoryStore.getState().reset();
  }, []);

  return null;
}
