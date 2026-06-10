'use client';

/**
 * TeamThreadView — RFP 팀 채팅(내부 메모) 스레드.
 *
 * ThreadView 와 동일한 시각 언어(말풍선 12px radius·13px 본문·5분 그룹핑·중앙
 * 날짜 구분선·.md-numeric 타임스탬프)를 따르되 표면은 의도적으로 작다:
 * 메시지만 — 타이핑/프레즌스/읽음/첨부 없음 (v1 확정 결정). 내부 스레드이므로
 * 타인 메시지에 멤버 이름+아바타 헤더를 단다. ChatRail 의 '팀 채팅' 탭 전용.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/primitives/Avatar';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Users } from 'lucide-react';
import { ArrowUpIcon } from '@/components/icons';
import { sendTeamMessageAction } from '@/lib/server/actions/chat/sendTeamMessageAction';
import { useTeamChannel, type TeamLivePayload } from '@/lib/hooks/useTeamChannel';
import { toast } from '@/lib/toast';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';
import { formatDayLabel, formatTime, withinGroupWindow } from './format';

type Props = {
  rfpId: string;
  /** Centrifugo 채널 조립용 — loadTeamThread 가 반환한 세션 워크스페이스. */
  workspaceId: string;
  /** 라이브 echo 의 self 판별용 — loadTeamThread 가 반환한 세션 유저 id. */
  viewerUserId: string;
  messages: TeamThreadMessage[];
};

// 하단에서 이만큼(px) 이내면 "하단 근처"로 보고 새 메시지를 자동 추적한다.
const NEAR_BOTTOM_PX = 120;

type LocalMessage = TeamThreadMessage & { pending?: boolean };

export function TeamThreadView({ rfpId, workspaceId, viewerUserId, messages }: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(messages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  // 새 메시지 append 시 하단 추적 — 단, 위로 올려 과거 메모를 읽는 중에 팀원
  // 메시지가 오면 끌어내리지 않는다(초기 로드·본인 전송·하단 근처만 추적).
  useEffect(() => {
    const grew = localMessages.length > prevLenRef.current;
    const isInitial = prevLenRef.current === 0;
    prevLenRef.current = localMessages.length;
    if (!grew) return;
    const last = localMessages[localMessages.length - 1];
    const el = listRef.current;
    const nearBottom =
      !el || el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    if (isInitial || last?.isSelf || nearBottom) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [localMessages]);

  useTeamChannel(rfpId, workspaceId, {
    onMessage: (data: TeamLivePayload) => {
      if (!data.id || typeof data.body !== 'string' || !data.createdAt) return;
      const id = data.id;
      const isSelf = data.authorUserId === viewerUserId;
      setLocalMessages((prev) => {
        // Dedup by id — 재전달·승격 선행 케이스.
        if (prev.some((m) => m.id === id)) return prev;
        // 본인 echo: pending 말풍선을 확정으로 승격(append 하면 중복).
        if (isSelf) {
          const pendingIdx = prev.findIndex((m) => m.pending);
          if (pendingIdx >= 0) {
            const next = prev.slice();
            next[pendingIdx] = {
              ...next[pendingIdx],
              id,
              pending: false,
              // 서버 권위 타임스탬프 채택 — 리로드 후 로더 렌더와 일치.
              createdAt: data.createdAt ?? next[pendingIdx].createdAt,
            };
            return next;
          }
        }
        return [
          ...prev,
          {
            id,
            authorUserId: data.authorUserId ?? '',
            authorName: data.authorName ?? '',
            body: data.body as string,
            createdAt: data.createdAt as string,
            isSelf,
          },
        ];
      });
    },
  });

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    setSending(true);

    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        authorUserId: viewerUserId,
        authorName: '',
        body,
        createdAt: new Date().toISOString(),
        isSelf: true,
        pending: true,
      },
    ]);
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let result: Awaited<ReturnType<typeof sendTeamMessageAction>>;
    try {
      result = await sendTeamMessageAction({ rfpId, body });
    } catch {
      result = { ok: false, error: 'NETWORK' };
    }
    setSending(false);
    if (result.ok) {
      const newId = result.messageId;
      const serverCreatedAt = result.createdAt;
      setLocalMessages((prev) => {
        const hasReal = prev.some((m) => m.id === newId);
        return prev.flatMap((m) =>
          m.id === tempId
            ? hasReal
              ? []
              : [{ ...m, id: newId, pending: false, createdAt: serverCreatedAt ?? m.createdAt }]
            : [m],
        );
      });
    } else {
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(restoreDraft);
      toast('메모를 남기지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 한글 IME 조합 확정 Enter(keyCode 229)는 전송이 아니다.
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 말풍선 목록 */}
      <div
        ref={listRef}
        data-message-list
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {localMessages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<Users strokeWidth={1.5} />}
              title="아직 팀 메시지가 없어요"
              description="우리 팀에게만 보이는 메모를 남겨보세요."
            />
          </div>
        )}
        {localMessages.map((m, i) => {
          const dayLabel = formatDayLabel(m.createdAt);
          const prev = i > 0 ? localMessages[i - 1] : null;
          const prevDayLabel = prev ? formatDayLabel(prev.createdAt) : null;
          const showDivider = dayLabel !== prevDayLabel;
          // 시간 판정은 ThreadView 와 공유(withinGroupWindow — 드리프트 방지 단일 출처).
          const groupedWithPrev =
            !showDivider &&
            prev !== null &&
            prev.authorUserId === m.authorUserId &&
            withinGroupWindow(prev.createdAt, m.createdAt);
          const showAuthorHeader = !m.isSelf && !groupedWithPrev;

          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDivider && (
                <div role="separator" className="flex justify-center py-1.5">
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {dayLabel}
                  </span>
                </div>
              )}

              <div
                data-message-row
                data-sender={m.isSelf ? 'self' : 'other'}
                className={cn('flex flex-col gap-1', m.isSelf ? 'items-end' : 'items-start')}
              >
                {showAuthorHeader && (
                  <div className="flex items-center gap-1.5">
                    <Avatar name={m.authorName} size="sm" color="surface" />
                    <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {m.authorName}
                    </span>
                  </div>
                )}

                <div className={cn('flex w-full items-end gap-1.5', m.isSelf && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'max-w-[78%] whitespace-pre-wrap break-words rounded-[var(--md-sys-shape-medium)] px-3 py-2 text-[13px] leading-relaxed',
                      m.isSelf
                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                        : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]',
                      m.pending && 'opacity-60',
                    )}
                  >
                    {m.body}
                  </div>
                  {m.pending ? (
                    <span
                      aria-label="전송 중"
                      className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)]"
                    />
                  ) : (
                    <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {formatTime(m.createdAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* 컴포저 — textarea + 보내기 (첨부 없음, v1 확정 결정) */}
      <div className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder="우리 팀에게만 보이는 메모를 남겨보세요…"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={handleKeyDown}
            className="min-h-8 max-h-40 flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
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
