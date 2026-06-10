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
import { XIcon, EnvelopeIcon, ChevronRightIcon, ArrowUpIcon } from '@/components/icons';
import { lookupConversationAction } from '@/lib/server/actions/chat/lookupConversationAction';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { toast } from '@/lib/toast';
import {
  useChatRailStore,
  type ChatRailCounterparty,
  type ChatRailTab,
} from '@/lib/stores/chat-rail';
import { ThreadPane } from './ThreadPane';
import { ThreadSkeleton } from './ThreadSkeleton';
import { TeamThreadView } from './TeamThreadView';
import { getTeamThreadPromise, invalidateTeamThread } from './team-thread-cache';

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

  // wsId → conversationId 해소 캐시. **읽기 전용 lookup** — null 은 "대화 없음"
  // 으로 캐시되고 새 대화 컴포저를 띄운다. 생성은 첫 메시지 전송에만 일어난다:
  // 열람·포커스 추종만으로 빈 페어 대화가 생기면 상대 인박스에 "보고 있다"는
  // 관심 신호가 새기 때문(sealed-bid). 실패는 wsId 단위로 기록해 무한 스켈레톤
  // 대신 에러 빈 상태 + 다시 시도를 노출한다.
  const [convByWs, setConvByWs] = useState<Record<string, string | null>>({});
  const [failedWs, setFailedWs] = useState<Record<string, boolean>>({});
  const activeWsId = counterparty?.workspaceId;
  const resolveFailed = activeWsId ? !!failedWs[activeWsId] : false;
  useEffect(() => {
    if (!open || tab !== 'counterparty' || !activeWsId) return;
    if (convByWs[activeWsId] !== undefined || failedWs[activeWsId]) return;
    let cancelled = false;
    void lookupConversationAction(activeWsId)
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
          ) : conversationId === undefined ? (
            <ThreadSkeleton />
          ) : conversationId === null ? (
            <NewConversationPane
              counterparty={counterparty}
              rfpId={rfpId}
              onCreated={(wsId, newId) =>
                setConvByWs((prev) => ({ ...prev, [wsId]: newId }))
              }
            />
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

/**
 * 새 대화 컴포저 — 아직 페어 대화가 없는 상대용. 첫 메시지를 보내는 순간에만
 * 대화가 생성된다(sendChatMessageAction 의 counterpartyWorkspaceId 경로).
 * 열람만으로는 어떤 행도 만들지 않는다 — sealed-bid 관심 신호 차단의 핵심.
 */
function NewConversationPane({
  counterparty,
  rfpId,
  onCreated,
}: {
  counterparty: ChatRailCounterparty;
  rfpId: string;
  onCreated: (wsId: string, conversationId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    setSending(true);
    let result: Awaited<ReturnType<typeof sendChatMessageAction>>;
    try {
      result = await sendChatMessageAction({
        counterpartyWorkspaceId: counterparty.workspaceId,
        body,
        rfpId,
        attachmentIds: [],
      });
    } catch {
      result = { ok: false, error: 'NETWORK' };
    }
    setSending(false);
    if (result.ok) {
      onCreated(counterparty.workspaceId, result.conversationId);
    } else {
      toast('메시지를 보내지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<EnvelopeIcon />}
          title="메시지를 보내면 대화가 시작돼요"
          description={`${counterparty.name}에 보낼 첫 메시지를 입력해 주세요.`}
          className="py-12"
        />
      </div>
      <div className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder="메시지를 입력하세요…"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                void handleSend();
              }
            }}
            className="min-h-8 flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
          />
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={sending || draft.trim().length === 0}
            aria-label="보내기"
          >
            <ArrowUpIcon size={16} />
            보내기
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 팀 채팅 탭 — Suspense 로더 래퍼 (thread-cache 의 use() 패턴).
 * unmount(탭 전환·레일 닫기) 시 캐시를 무효화해 재진입이 항상 신선한 스레드를
 * refetch 하게 한다 — 모듈 캐시가 첫 로드 스냅샷을 영구 재생하면 그 사이의
 * 본인 전송·팀원 메시지가 리로드 전까지 화면에서 사라진다.
 */
function TeamThreadPane({ rfpId }: { rfpId: string }) {
  const [, setRetryCount] = useState(0);
  useEffect(() => () => invalidateTeamThread(rfpId), [rfpId]);
  const result = use(getTeamThreadPromise(rfpId));
  if (!result.ok) {
    return (
      <EmptyState
        title="팀 채팅을 불러오지 못했어요"
        description="네트워크 상태를 확인하고 다시 시도해 주세요."
        className="py-12"
        action={
          <Button
            size="sm"
            onClick={() => {
              // 실패 결과가 캐시에 남아 있으므로 비우고 재서스펜드시킨다.
              invalidateTeamThread(rfpId);
              setRetryCount((n) => n + 1);
            }}
          >
            다시 시도
          </Button>
        }
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
