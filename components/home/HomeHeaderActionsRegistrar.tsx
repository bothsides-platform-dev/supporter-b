'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';

export function HomeHeaderActionsRegistrar() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const setRefreshAction = useHeaderActionsStore((s) => s.setRefreshAction);
  const clearRefreshAction = useHeaderActionsStore((s) => s.clearRefreshAction);

  const onRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastRefreshedAt(new Date());
    });
  }, [router]);

  useEffect(() => {
    setRefreshAction({ onRefresh, lastRefreshedAt, isRefreshing: isPending });
  }, [onRefresh, lastRefreshedAt, isPending, setRefreshAction]);

  useEffect(() => {
    return () => clearRefreshAction();
  }, [clearRefreshAction]);

  return null;
}
