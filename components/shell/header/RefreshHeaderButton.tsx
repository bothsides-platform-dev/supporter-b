'use client';

import { useEffect, useReducer, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  onRefresh: () => void;
  lastRefreshedAt: Date;
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
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    const id = setInterval(forceUpdate, LABEL_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  const label = formatRelative(lastRefreshedAt);

  const handleClick = () => {
    setIsSpinning(true);
    onRefresh();
    setTimeout(() => setIsSpinning(false), 350);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isRefreshing || isSpinning}
      onClick={handleClick}
      aria-label={`새로고침: ${label}`}
    >
      <RefreshCw
        size={14}
        className={cn(isSpinning ? 'animate-spin-once' : isRefreshing && 'animate-spin')}
      />
      {label}
    </Button>
  );
}
