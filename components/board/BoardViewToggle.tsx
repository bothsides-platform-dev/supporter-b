'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/primitives/Tabs';
import type { BoardView } from '@/lib/server/board/filterRfps';

type Props = {
  view: BoardView;
  cookieName: string;
  tableCount?: number;
};

export function BoardViewToggle({ view, cookieName, tableCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setView = (id: string) => {
    if (id !== 'table' && id !== 'board') return;
    document.cookie = `${cookieName}=${id}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Tabs
      className="border-b-0"
      tabs={[
        { id: 'table', label: '표', count: tableCount },
        { id: 'board', label: '칸반' },
      ]}
      active={view}
      onChange={setView}
    />
  );
}
