'use client';

/**
 * DealRoomModal — 인터셉트 라우트가 목록 위에 띄우는 견적 딜룸 모달.
 *
 * @base-ui Dialog 의 Backdrop(흐림 처리) + 대형 Popup. controlled `open`(항상 true)
 * + Trigger 없음 — 라우트가 마운트되면 곧 열린 상태다. Escape·백드롭 클릭·닫기(✕)
 * 는 router.back() 으로 매핑돼 URL 까지 함께 pop 한다(목록 복귀).
 *
 * 전체화면(⤢): CSS 로 Popup 을 inset-0 확장(리마운트·리페치 없음) → 채팅·위저드
 * 상태가 보존된다. 전체화면 여부는 useDealRoomNav 에 두어 이전/다음 이동이 모달을
 * 리마운트해도 의도적으로 보존되며(로컬 useState 는 리마운트 시 리셋), 닫을 때만
 * close() 가 해제한다(이전/다음은 close 를 거치지 않음 → 보존). 새로고침/딥링크는
 * 인터셉터를 건너뛰어 정식 페이지가 렌더된다.
 * 이전/다음(‹ ›): useDealRoomNav 의 목록 순서에서 prev/next 코드를 계산해 같은
 * 세그먼트로 router.replace(인터셉트 → 모달 교체, Back 은 항상 목록 복귀).
 */
import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { useDealRoomNav } from '@/lib/stores/deal-room-nav';
import { DealRoomShell } from './DealRoomShell';

type DealRoomModalProps = {
  code: string;
  title: string;
  statusChip?: ReactNode;
  /** 우측 채팅 칼럼(상대방/팀). */
  chat?: ReactNode;
  children: ReactNode;
};

export function DealRoomModal({
  code,
  title,
  statusChip,
  chat,
  children,
}: DealRoomModalProps) {
  const router = useRouter();
  const { basePath, codes, fullscreen, setFullscreen } = useDealRoomNav();
  const close = () => {
    setFullscreen(false); // 닫을 때만 전체화면 해제 — 다음 오픈은 윈도우드.
    router.back();
  };

  const i = codes.indexOf(code);
  const prevCode = i > 0 ? codes[i - 1] : undefined;
  const nextCode = i >= 0 && i < codes.length - 1 ? codes[i + 1] : undefined;
  const go = (target?: string) => {
    if (target && basePath) router.replace(`${basePath}/${target}`);
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-fullscreen={fullscreen ? 'true' : undefined}
          className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-[fullscreen=true]:bg-transparent data-[fullscreen=true]:backdrop-blur-none dark:bg-white/10"
        />
        <DialogPrimitive.Popup
          data-testid="deal-room-modal"
          data-fullscreen={fullscreen ? 'true' : undefined}
          className="fixed top-1/2 left-1/2 z-50 flex h-[min(900px,calc(100dvh-2rem))] w-[min(1320px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--md-sys-shape-extra-large)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)] ring-1 ring-[var(--md-sys-color-outline-variant)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[fullscreen=true]:h-dvh data-[fullscreen=true]:w-screen data-[fullscreen=true]:rounded-none data-[fullscreen=true]:ring-0"
        >
          <DealRoomShell
            mode="modal"
            code={code}
            title={title}
            statusChip={statusChip}
            onClose={close}
            chat={chat}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(!fullscreen)}
            onPrev={() => go(prevCode)}
            onNext={() => go(nextCode)}
            hasPrev={prevCode != null}
            hasNext={nextCode != null}
          >
            {children}
          </DealRoomShell>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
