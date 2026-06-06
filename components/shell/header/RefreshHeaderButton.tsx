'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

type Props = {
  onRefresh: () => void;
  lastRefreshedAt: Date | null;
  isRefreshing: boolean;
};

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  return `${Math.floor(diffMin / 60)}시간 전`;
}

export function RefreshHeaderButton({ onRefresh, lastRefreshedAt, isRefreshing }: Props) {
  const [label, setLabel] = useState<string>(() =>
    lastRefreshedAt ? formatRelative(lastRefreshedAt) : '새로고침',
  );

  useEffect(() => {
    if (!lastRefreshedAt) {
      setLabel('새로고침');
      return;
    }
    setLabel(formatRelative(lastRefreshedAt));
    const id = setInterval(() => setLabel(formatRelative(lastRefreshedAt)), 60_000);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isRefreshing}
      onClick={onRefresh}
      aria-label={label}
    >
      <RefreshIcon className={cn(isRefreshing && 'animate-spin')} />
      {label}
    </Button>
  );
}
