'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshIcon } from '@/components/icons';

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className={isPending ? '[&_svg]:animate-spin' : ''}
    >
      <RefreshIcon />
      새로고침
    </Button>
  );
}
