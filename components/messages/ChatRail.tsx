'use client';

/**
 * ChatRail — 상세 화면(구매사 RFP 상세 / PG 인박스 상세) 우측 고정 채팅 레일.
 *
 * 내부 UI(탭·상대방/팀 페인·lazy 해소)는 ChatPanel 로 추출됐다. ChatRail 은
 * 레일 고유의 레이아웃·수명만 담당한다:
 *   - sticky aside(w-96, lg 이상) + open-gate(스토어 open).
 *   - fixedCounterparty 시드(PG 측) — 닫혀 있어도 실행돼 다른 진입점도 같은
 *     스토어 값을 쓴다.
 *   - unmount 시 스토어 reset(다른 상세로의 상태 누수 방지).
 *
 * sticky 높이 주의: 셸 스크롤 컨테이너(AppSidebarLayout main) 기준이며 헤더가
 * h-12 라는 가정에 결합 — 헤더 높이가 바뀌면 calc 도 함께 바꿔야 한다. 견적 딜룸
 * 모달은 이 sticky/aside 없이 ChatPanel 을 우측 칼럼에 직접 마운트한다.
 * lg 미만은 레일 대신 ChatRailToggle 의 모바일 폴백(/messages?c=)을 쓴다.
 */
import { useEffect } from 'react';

import {
  useChatRailStore,
  type ChatRailCounterparty,
} from '@/lib/stores/chat-rail';
import { ChatPanel } from './ChatPanel';

type Props = {
  /** RFP uuid (라우트 param 은 사람용 code — 혼동 주의). */
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  /** PG 인박스 상세처럼 상대가 고정인 화면 — 마운트 시 스토어에 시드된다. */
  fixedCounterparty?: ChatRailCounterparty;
  /** 샘플 RFP — 상대방 채팅 전송 차단(팀 채팅은 정상). */
  isSample?: boolean;
};

export function ChatRail({
  rfpId,
  rfpCode,
  rfpTitle,
  fixedCounterparty,
  isSample = false,
}: Props) {
  const open = useChatRailStore((s) => s.open);
  const setCounterparty = useChatRailStore((s) => s.setCounterparty);

  // 고정 상대(PG 측) 시드 — 닫혀 있어도(early return 전) 실행된다.
  const fixedWsId = fixedCounterparty?.workspaceId;
  useEffect(() => {
    if (fixedCounterparty) setCounterparty(fixedCounterparty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 객체 identity 대신 wsId 로 추적
  }, [fixedWsId, setCounterparty]);

  // 페이지 단위 상태 — 레일 unmount(상세 이탈) 시 다른 페이지로 새지 않게 reset.
  useEffect(() => () => useChatRailStore.getState().reset(), []);

  if (!open) return null;

  return (
    <aside
      aria-label="채팅 패널"
      className="sticky top-0 hidden h-[calc(100dvh-3rem)] w-96 shrink-0 flex-col self-start border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] lg:flex"
    >
      <ChatPanel
        rfpId={rfpId}
        rfpCode={rfpCode}
        rfpTitle={rfpTitle}
        isSample={isSample}
        onClose={() => useChatRailStore.getState().setOpen(false)}
      />
    </aside>
  );
}
