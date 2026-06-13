'use client';

/**
 * DealRoomModal — 인터셉트 라우트가 목록 위에 띄우는 견적 딜룸 모달.
 *
 * @base-ui Dialog 의 Backdrop(흐림 처리) + 대형 Popup 으로 구성된다. controlled
 * `open`(항상 true) + Trigger 없음 — 라우트가 마운트되면 곧 열린 상태다. Escape·
 * 백드롭 클릭·닫기(✕) 는 모두 router.back() 으로 매핑돼 URL 까지 함께 pop 한다
 * (목록 복귀). 새로고침·딥링크는 인터셉터를 건너뛰고 정식 페이지가 풀스크린으로
 * 렌더되므로, 모달과 페이지는 같은 본문(children)을 공유한다.
 */
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { DealRoomShell } from './DealRoomShell';

type DealRoomModalProps = {
  code: string;
  title: string;
  fullscreenHref: string;
  statusChip?: ReactNode;
  children: ReactNode;
};

export function DealRoomModal({
  code,
  title,
  fullscreenHref,
  statusChip,
  children,
}: DealRoomModalProps) {
  const router = useRouter();
  const close = () => router.back();

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 dark:bg-white/10" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[min(900px,calc(100dvh-2rem))] w-[min(1320px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--md-sys-shape-extra-large)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)] ring-1 ring-[var(--md-sys-color-outline-variant)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DealRoomShell
            mode="modal"
            code={code}
            title={title}
            fullscreenHref={fullscreenHref}
            statusChip={statusChip}
            onClose={close}
          >
            {children}
          </DealRoomShell>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
