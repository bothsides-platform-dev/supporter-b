'use client';

/**
 * ChatPanel — 레이아웃 비종속 채팅 패널. 탭 [상대방 채팅 | 팀 채팅] + 각 페인.
 *
 * ChatRail(sticky aside, open-gate, fixedCounterparty 시드, unmount reset)이 이를
 * 감싸 상세 페이지 우측 레일로 쓰고, 견적 딜룸 모달은 우측 칼럼에 직접 마운트한다
 * (open-gate·sticky·aside 없음 — 모달 안엔 셸 스크롤 컨테이너가 없으므로 높이는
 * 부모가 준다: `h-full min-h-0`).
 *
 * 불변식(레일과 동일):
 *   - 상대방 탭은 wsId→conversationId 를 **읽기 전용** lookupConversationAction 으로
 *     해소한다. 열람만으로 대화를 생성하지 않는다(sealed-bid 관심 신호 차단) —
 *     생성은 첫 전송(sendChatMessageAction)에만 일어난다.
 *   - 팀 탭은 (rfp, 세션 워크스페이스) 내부 스레드. unmount 시 캐시 무효화.
 */
import { Suspense, useEffect, useState } from 'react';
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
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';

type Props = {
  /** RFP uuid (라우트 param 은 사람용 code — 혼동 주의). */
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  /** 샘플 RFP — 상대방 채팅 전송 차단(팀 채팅은 정상). */
  isSample?: boolean;
  /** 제공되면 헤더에 닫기 버튼을 렌더(레일용). 모달은 생략한다. */
  onClose?: () => void;
};

const RAIL_TABS = [
  { id: 'counterparty', label: '상대방 채팅' },
  { id: 'team', label: '팀 채팅' },
];

export function ChatPanel({ rfpId, rfpCode, rfpTitle, isSample = false, onClose }: Props) {
  const tab = useChatRailStore((s) => s.tab);
  const counterparty = useChatRailStore((s) => s.counterparty);
  const setTab = useChatRailStore((s) => s.setTab);

  // wsId → conversationId 읽기 전용 해소 캐시. null = "대화 없음"(새 대화 컴포저).
  // 생성은 첫 전송에만. 실패는 wsId 단위로 기록해 무한 스켈레톤 대신 에러 빈 상태.
  const [convByWs, setConvByWs] = useState<Record<string, string | null>>({});
  const [failedWs, setFailedWs] = useState<Record<string, boolean>>({});
  const activeWsId = counterparty?.workspaceId;
  const resolveFailed = activeWsId ? !!failedWs[activeWsId] : false;
  useEffect(() => {
    if (tab !== 'counterparty' || !activeWsId) return;
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
  }, [tab, activeWsId, convByWs, failedWs]);

  const conversationId = activeWsId ? convByWs[activeWsId] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--md-sys-color-surface)]">
      <div className="flex shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] pr-1.5">
        <Tabs
          className="flex-1 border-b-0"
          tabs={RAIL_TABS}
          active={tab}
          onChange={(id) => setTab(id as ChatRailTab)}
        />
        {onClose && (
          <IconButton label="채팅 패널 닫기" size="sm" onClick={onClose}>
            <XIcon />
          </IconButton>
        )}
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
              sendDisabled={isSample}
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
                    sendDisabled={isSample}
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
          <TeamThreadPane rfpId={rfpId} />
        )}
      </div>
    </div>
  );
}

/**
 * 새 대화 컴포저 — 아직 페어 대화가 없는 상대용. 첫 메시지를 보내는 순간에만
 * 대화가 생성된다. 열람만으로는 어떤 행도 만들지 않는다(sealed-bid 핵심).
 */
function NewConversationPane({
  counterparty,
  rfpId,
  onCreated,
  sendDisabled = false,
}: {
  counterparty: ChatRailCounterparty;
  rfpId: string;
  onCreated: (wsId: string, conversationId: string) => void;
  sendDisabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (body.length === 0 || sending || sendDisabled) return;
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
      {sendDisabled && (
        <p className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          샘플에서는 메시지를 보낼 수 없어요. 실제 견적 요청을 보내보세요.
        </p>
      )}
      <div className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            maxLength={4000}
            disabled={sendDisabled}
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
            className="min-h-8 flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)] disabled:opacity-60"
          />
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={sendDisabled || sending || draft.trim().length === 0}
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
 * 팀 채팅 탭 — useEffect 로더 패턴. use(serverAction) 의 render-phase Router
 * 업데이트 경고를 피한다. unmount 시 캐시 무효화 → 재진입마다 신선한 스레드.
 */
function TeamThreadPane({ rfpId }: { rfpId: string }) {
  const [result, setResult] = useState<LoadTeamThreadResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rfpId/재시도 변경 시 이전 스레드를 즉시 비워 스켈레톤을 보여주는 의도된 리셋
    setResult(null);
    getTeamThreadPromise(rfpId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
      invalidateTeamThread(rfpId);
    };
  }, [rfpId, retryCount]);

  if (!result) return <ThreadSkeleton />;

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
