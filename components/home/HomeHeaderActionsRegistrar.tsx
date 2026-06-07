'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';

/** Minimum spinner visibility so refresh feedback completes at least one visible turn. */
export const MIN_REFRESH_SPIN_MS = 400;

export function HomeHeaderActionsRegistrar() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const [minSpinActive, setMinSpinActive] = useState(false);
  const spinStartedAtRef = useRef<number | null>(null);
  const setRefreshAction = useHeaderActionsStore((s) => s.setRefreshAction);
  const clearRefreshAction = useHeaderActionsStore((s) => s.clearRefreshAction);

  const onRefresh = useCallback(() => {
    spinStartedAtRef.current = Date.now();
    setMinSpinActive(true);
    startTransition(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    });
  }, [router]);

  useEffect(() => {
    if (isPending || !minSpinActive || spinStartedAtRef.current === null) return;

    const elapsed = Date.now() - spinStartedAtRef.current;
    const remaining = MIN_REFRESH_SPIN_MS - elapsed;
    if (remaining <= 0) {
      setMinSpinActive(false);
      spinStartedAtRef.current = null;
      return;
    }

    const id = setTimeout(() => {
      setMinSpinActive(false);
      spinStartedAtRef.current = null;
    }, remaining);
    return () => clearTimeout(id);
  }, [isPending, minSpinActive]);

  const isRefreshing = isPending || minSpinActive;

  useEffect(() => {
    setRefreshAction({ onRefresh, lastRefreshedAt, isRefreshing });
  }, [onRefresh, lastRefreshedAt, isRefreshing, setRefreshAction]);

  // Separate effect so clearRefreshAction only fires on unmount, not on every dep change.
  // Merging into the sync effect above would null the slot briefly between renders,
  // causing the header button to flicker each time isRefreshing or lastRefreshedAt updates.
  useEffect(() => {
    return () => clearRefreshAction();
  }, [clearRefreshAction]);

  return null;
}
