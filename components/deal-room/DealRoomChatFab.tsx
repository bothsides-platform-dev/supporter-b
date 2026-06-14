'use client';

import { useState, type ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * DealRoomChatFab — lg 미만에서 채팅을 띄우는 플로팅 버튼 + 하단 시트.
 *
 * 딜룸 셸이 lg 이상에선 우측 채팅 aside 를, lg 미만에선 이 FAB 를 렌더한다(둘 중
 * 하나만 → 채팅 인스턴스 단일 보장). 시트는 열릴 때만 children(=채팅)을 마운트한다.
 * Linear: pill 금지 — 8px(shape-medium) 라운드 사각, 라인 아이콘, 플로팅 elevation.
 */
export function DealRoomChatFab({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="채팅 열기"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex h-12 w-12 items-center justify-center rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-2)] transition-opacity hover:opacity-90 lg:hidden [&_svg]:size-5"
      >
        <MessageSquare strokeWidth={1.5} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80dvh] gap-0 p-0">
          <SheetTitle className="sr-only">채팅</SheetTitle>
          <div className="flex h-full min-h-0 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
