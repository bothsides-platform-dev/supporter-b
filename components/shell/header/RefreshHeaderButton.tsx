'use client';

import { useEffect, useReducer } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

type Props = {
  onRefresh: () => void;
  lastRefreshedAt: Date | null;
  isRefreshing: boolean;
};

const LABEL_REFRESH_INTERVAL_MS = 60_000;

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  return `${Math.floor(diffMin / 60)}시간 전`;
}

export function RefreshHeaderButton({ onRefresh, lastRefreshedAt, isRefreshing }: Props) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!lastRefreshedAt) return;
    const id = setInterval(forceUpdate, LABEL_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  const label = lastRefreshedAt ? formatRelative(lastRefreshedAt) : '새로고침';

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isRefreshing}
      onClick={onRefresh}
      aria-label={label === '새로고침' ? '새로고침' : `새로고침: ${label}`}
    >
      <RefreshIcon className={cn(isRefreshing && 'animate-spin')} />
      {label}
    </Button>
  );
}
