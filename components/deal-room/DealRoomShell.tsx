'use client';

/**
 * DealRoomShell — 견적 딜룸의 레이아웃 골격(상단바 + 3-pane 본문).
 *
 * mode='modal' 은 인터셉트 라우트가 띄우는 모달 안에서, mode='page' 는 정식
 * 상세 페이지(새로고침·딥링크)에서 렌더된다. 둘 다 같은 본문을 감싸 시각이 일치한다.
 *
 * 상단바: ‹ ›(목록 순서 이전/다음) · 코드·제목 · 상태칩 · 전체화면 토글 · 닫기.
 * 본문: children(좌측 레일 + 가운데 탭) + 우측 채팅(lg 이상). 전체화면은 모달을
 * CSS 로 inset-0 확장(리마운트·리페치 없음) — DealRoomModal 이 상태를 소유한다.
 */
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';

import { IconButton } from '@/components/primitives/IconButton';
import { useIsLgUp } from '@/lib/hooks/useIsLgUp';
import { DealRoomChatFab } from './DealRoomChatFab';
import { DealRoomProvider } from './DealRoomContext';

type DealRoomShellProps = {
  mode: 'modal' | 'page';
  /** 사람용 코드 P-YYMM-NNNN */
  code: string;
  title: string;
  statusChip?: ReactNode;
  /** modal 모드 닫기(보통 router.back). */
  onClose?: () => void;
  /** 전체화면 토글(CSS inset-0). 제공 시 ⤢ 버튼 노출(modal 모드). */
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** 목록 순서 이전/다음 견적으로 이동. 끝단/컨텍스트 없음이면 비활성. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** 우측 채팅 칼럼(상대방/팀). lg 이상에서만 노출. */
  chat?: ReactNode;
  children: ReactNode;
};

export function DealRoomShell({
  mode,
  code,
  title,
  statusChip,
  onClose,
  fullscreen = false,
  onToggleFullscreen,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  chat,
  children,
}: DealRoomShellProps) {
  const showNav = mode === 'modal' && (onPrev != null || onNext != null);
  // 채팅을 lg 이상은 우측 aside, lg 미만은 FAB+하단 시트로 — 둘 중 하나만 렌더해
  // DealRoomChat 인스턴스가 항상 단 하나(스토어 시드/리셋 충돌 방지)가 되게 한다.
  const lgUp = useIsLgUp();

  // Provider 를 code 별로 마운트 — 딜룸을 옮기면(prev/next·다른 상세) 상대방·탭 상태가
  // 깨끗이 초기화돼 이전 딜룸의 상대가 새지 않는다(전역 스토어 + 수동 reset 대체).
  return (
    <DealRoomProvider key={code}>
      <div
        data-mode={mode}
        className="flex h-full min-h-0 flex-col bg-[var(--md-sys-color-surface)]"
      >
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-2.5">
        {showNav && (
          <div className="flex items-center">
            <IconButton label="이전 견적" size="sm" onClick={onPrev} disabled={!hasPrev}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="다음 견적" size="sm" onClick={onNext} disabled={!hasNext}>
              <ChevronRight />
            </IconButton>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <span className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {code}
          </span>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <span className="truncate text-[14px] font-[600] tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
            {title}
          </span>
        </div>
        {statusChip}
        <div className="ml-auto flex items-center gap-0.5">
          {mode === 'modal' && onToggleFullscreen && (
            <IconButton
              label={fullscreen ? '창 모드로' : '전체화면'}
              size="sm"
              onClick={onToggleFullscreen}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          )}
          {mode === 'modal' && onClose && (
            <IconButton label="닫기" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{children}</div>
        {chat && lgUp && (
          <aside
            aria-label="채팅"
            className="flex w-[360px] shrink-0 flex-col border-l border-[var(--md-sys-color-outline-variant)]"
          >
            {chat}
          </aside>
        )}
      </div>
      {chat && !lgUp && <DealRoomChatFab>{chat}</DealRoomChatFab>}
      </div>
    </DealRoomProvider>
  );
}
