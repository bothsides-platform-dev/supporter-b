'use client';

/**
 * ChatRail — 상세 화면(구매사 RFP 상세 / PG 인박스 상세) 우측 고정 채팅 레일.
 *
 * 본문 옆에 나란히 열리는 sticky 패널(w-96). 탭 [상대방 채팅 | 팀 채팅]:
 *   - 상대방 채팅: 기존 buyer↔PG 페어 대화를 그대로 임베드 (ThreadPane
 *     variant='rail'). 상대는 chat-rail 스토어에서 읽는다 — 구매사 측은
 *     FocusComparison 이 포커스된 PG 를 publish(탭 추종), PG 측은
 *     fixedCounterparty 를 마운트 시 스토어에 시드한다. wsId→conversationId 는
 *     getOrCreateConversationAction 으로 lazy 해소(상대당 1회, 메시지 미발송).
 *   - 팀 채팅: (rfp, 세션 워크스페이스) 내부 스레드 (TeamThreadView).
 *
 * sticky 높이 주의: 셸 스크롤 컨테이너(AppSidebarLayout main) 기준이며 헤더가
 * h-12 라는 가정에 결합 — 헤더 높이가 바뀌면 calc 도 함께 바꿔야 한다.
 * lg 미만은 레일 대신 ChatRailToggle 의 모바일 폴백(/messages?c=)을 쓴다.
 */
import { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';

import { Tabs } from '@/components/primitives/Tabs';
import { IconButton } from '@/components/primitives/IconButton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Button } from '@/components/ui/button';
import { XIcon, EnvelopeIcon, ChevronRightIcon } from '@/components/icons';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import {
  useChatRailStore,
  type ChatRailCounterparty,
  type ChatRailTab,
} from '@/lib/stores/chat-rail';
import { ThreadPane } from './ThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import { TeamThreadView } from './TeamThreadView';
import { getTeamThreadPromise } from './team-thread-cache';

type Props = {
  /** RFP uuid (라우트 param 은 사람용 code — 혼동 주의). */
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  /** PG 인박스 상세처럼 상대가 고정인 화면 — 마운트 시 스토어에 시드된다. */
  fixedCounterparty?: ChatRailCounterparty;
};

const RAIL_TABS = [
  { id: 'counterparty', label: '상대방 채팅' },
  { id: 'team', label: '팀 채팅' },
];

export function ChatRail({ rfpId, rfpCode, rfpTitle, fixedCounterparty }: Props) {
  const open = useChatRailStore((s) => s.open);
  const tab = useChatRailStore((s) => s.tab);
  const counterparty = useChatRailStore((s) => s.counterparty);
  const setOpen = useChatRailStore((s) => s.setOpen);
  const setTab = useChatRailStore((s) => s.setTab);
  const setCounterparty = useChatRailStore((s) => s.setCounterparty);

  // 고정 상대(PG 측) 시드 — 닫혀 있어도(early return 전) 실행되므로
  // ChatRailToggle 의 모바일 폴백도 같은 스토어 값을 쓴다.
  const fixedWsId = fixedCounterparty?.workspaceId;
  useEffect(() => {
    if (fixedCounterparty) setCounterparty(fixedCounterparty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 객체 identity 대신 wsId 로 추적
  }, [fixedWsId, setCounterparty]);

  // 페이지 단위 상태 — 레일 unmount(상세 이탈) 시 다른 페이지로 새지 않게 reset.
  useEffect(() => () => useChatRailStore.getState().reset(), []);

  // wsId → conversationId 해소 캐시. 레일이 열려 있고 상대방 탭일 때만 lazy 해소
  // (열람만으로 빈 페어 대화가 생기는 부수효과를 탭 활성 시점으로 한정).
  // 실패는 wsId 단위로 기록해 무한 스켈레톤 대신 에러 빈 상태 + 다시 시도를
  // 노출한다 — 상대가 바뀌면 새 wsId 는 실패 기록이 없으므로 자연히 재해소.
  const [convByWs, setConvByWs] = useState<Record<string, string>>({});
  const [failedWs, setFailedWs] = useState<Record<string, boolean>>({});
  const activeWsId = counterparty?.workspaceId;
  const resolveFailed = activeWsId ? !!failedWs[activeWsId] : false;
  useEffect(() => {
    if (!open || tab !== 'counterparty' || !activeWsId) return;
    if (convByWs[activeWsId] || failedWs[activeWsId]) return;
    let cancelled = false;
    void getOrCreateConversationAction(activeWsId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFailedWs((prev) => ({ ...prev, [activeWsId]: true }));
          return;
        }
        setConvByWs((prev) => ({ ...prev, [activeWsId]: r.conversationId }));
      })
      .catch(() => {
        if (!cancelled) setFailedWs((prev) => ({ ...prev, [activeWsId]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, activeWsId, convByWs, failedWs]);

  if (!open) return null;

  const conversationId = activeWsId ? convByWs[activeWsId] : undefined;

  return (
    <aside
      aria-label="채팅 패널"
      className="sticky top-0 hidden h-[calc(100dvh-3rem)] w-96 shrink-0 flex-col self-start border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] lg:flex"
    >
      <div className="flex shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] pr-1.5">
        <Tabs
          className="flex-1 border-b-0"
          tabs={RAIL_TABS}
          active={tab}
          onChange={(id) => setTab(id as ChatRailTab)}
        />
        <IconButton label="채팅 패널 닫기" size="sm" onClick={() => setOpen(false)}>
          <XIcon />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'counterparty' ? (
          !counterparty ? (
            <EmptyState
              icon={<EnvelopeIcon />}
              title="대화할 상대를 선택해 주세요"
              description="견적을 선택하면 해당 PG와 바로 대화할 수 있어요."
              className="py-12"
            />
          ) : resolveFailed ? (
            <EmptyState
              icon={<EnvelopeIcon />}
              title="대화를 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해 주세요."
              className="py-12"
              action={
                <Button
                  size="sm"
                  onClick={() =>
                    activeWsId &&
                    setFailedWs((prev) => ({ ...prev, [activeWsId]: false }))
                  }
                >
                  다시 시도
                </Button>
              }
            />
          ) : !conversationId ? (
            <ThreadSkeleton />
          ) : (
            <>
              <div className="min-h-0 flex-1">
                <Suspense key={conversationId} fallback={<ThreadSkeleton />}>
                  <ThreadPane
                    conversationId={conversationId}
                    counterpartyFallback={{ ...counterparty, hasLogo: false }}
                    variant="rail"
                    defaultRfpId={rfpId}
                    rfpById={{ [rfpId]: { code: rfpCode, title: rfpTitle } }}
                  />
                </Suspense>
              </div>
              <div className="flex shrink-0 justify-end border-t border-[var(--md-sys-color-outline-variant)] px-3 py-1.5">
                <Link
                  href={`/messages?c=${conversationId}`}
                  className="inline-flex items-center gap-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-on-surface)]"
                >
                  메시지함에서 열기
                  <ChevronRightIcon size={13} />
                </Link>
              </div>
            </>
          )
        ) : (
          <Suspense fallback={<ThreadSkeleton />}>
            <TeamThreadPane rfpId={rfpId} />
          </Suspense>
        )}
      </div>
    </aside>
  );
}

/** 팀 채팅 탭 — Suspense 로더 래퍼 (thread-cache 의 use() 패턴). */
function TeamThreadPane({ rfpId }: { rfpId: string }) {
  const result = use(getTeamThreadPromise(rfpId));
  if (!result.ok) {
    return (
      <EmptyState
        title="팀 채팅을 불러오지 못했어요"
        description="잠시 후 다시 시도해 주세요."
        className="py-12"
      />
    );
  }
  return (
    <TeamThreadView
      rfpId={result.rfpId}
      workspaceId={result.workspaceId}
      viewerUserId={result.viewerUserId}
      messages={result.messages}
    />
  );
}
