'use client';

/**
 * TeamThreadView — RFP 팀 채팅(내부 메모) 스레드.
 *
 * ThreadView 와 동일한 시각 언어(말풍선 12px radius·13px 본문·5분 그룹핑·중앙
 * 날짜 구분선·.md-numeric 타임스탬프)를 따르되 표면은 의도적으로 작다:
 * 메시지 + PDF·이미지 첨부 — 타이핑/프레즌스/읽음 없음 (per-bid 메모를 흡수).
 * 내부 스레드이므로 타인 메시지에 멤버 이름+아바타 헤더를 단다. ChatRail 의
 * '팀 채팅' 탭 전용.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/primitives/Avatar';
import { IconButton } from '@/components/primitives/IconButton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Users, Paperclip } from 'lucide-react';
import { ArrowUpIcon, XIcon } from '@/components/icons';
import { ACCEPT_EXT } from '@/lib/server/storage/constants';
import { sendTeamMessageAction } from '@/lib/server/actions/chat/sendTeamMessageAction';
import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';
import { useTeamChannel, type TeamLivePayload } from '@/lib/hooks/useTeamChannel';
import { toast } from '@/lib/toast';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';
import { MessageBubble } from './MessageBubble';
import { useComposerAttachments, toReadyMessageAttachments } from './useComposerAttachments';
import { useStickToBottom } from './useStickToBottom';
import { promoteSentMessage, removeMessage, applyLiveEcho } from './optimistic-thread';
import { formatDayLabel, withinGroupWindow } from './format';
import { MentionText } from './MentionText';
import { MentionDropdown } from './MentionDropdown';
import { type MentionCandidate } from './mention-input';
import { useMentionPicker } from './useMentionPicker';

type Props = {
  rfpId: string;
  /** Centrifugo 채널 조립용 — loadTeamThread 가 반환한 세션 워크스페이스. */
  workspaceId: string;
  /** 라이브 echo 의 self 판별용 — loadTeamThread 가 반환한 세션 유저 id. */
  viewerUserId: string;
  /** 낙관적 말풍선 아바타 표시용 — loadTeamThread 가 반환한 뷰어 아바타 버전. */
  viewerAvatarUpdatedAt: string | null;
  messages: TeamThreadMessage[];
  teamMembers?: MentionCandidate[];
};


type LocalMessage = TeamThreadMessage & { pending?: boolean };

export function TeamThreadView({ rfpId, workspaceId, viewerUserId, viewerAvatarUpdatedAt, messages, teamMembers = [] }: Props) {
  const [draft, setDraft] = useState('');
  const {
    rows: attachments,
    setRows: setAttachments,
    addFiles,
    removeRow,
  } = useComposerAttachments({ ownerKind: 'team_message', ownerId: rfpId });
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(messages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastIsOwn = localMessages[localMessages.length - 1]?.isSelf ?? false;
  const { listRef, bottomRef } = useStickToBottom({
    count: localMessages.length,
    isOwnLast: lastIsOwn,
  });

  const mention = useMentionPicker({ teamMembers, viewerUserId, textareaRef, draft, setDraft });
  // 안정적 렌더러 — MessageBubble(memo)이 컴포저 입력마다 리렌더되지 않도록 ref 고정.
  const renderTeamBody = useCallback(
    (body: string) => (
      <MentionText body={body} nameById={mention.nameById} viewerUserId={viewerUserId} />
    ),
    [mention.nameById, viewerUserId],
  );

  // 마운트(및 rfp 전환) 시 팀 스레드를 읽음 처리한다 — ThreadView 의
  // markConversationReadAction 패턴 미러링.
  useEffect(() => {
    void markTeamThreadReadAction({ rfpId });
  }, [rfpId]);


  useTeamChannel(rfpId, workspaceId, {
    onMessage: (data: TeamLivePayload) => {
      if (!data.id || typeof data.body !== 'string' || !data.createdAt) return;
      const id = data.id;
      const isSelf = data.authorUserId === viewerUserId;
      // 재전달·승격 선행 케이스는 dedup. 본인 echo 면 tempId 로 정확 매칭 후
      // 확정 승격(append 하면 중복, 낙관적 첨부 보존), 아니면 새로 append.
      setLocalMessages(
        (prev) =>
          applyLiveEcho(prev, id, isSelf, data.createdAt as string, data.tempId as string | undefined) ?? [
            ...prev,
            {
              id,
              authorUserId: data.authorUserId ?? '',
              authorName: data.authorName ?? '',
              authorAvatarUpdatedAt: data.authorAvatarUpdatedAt ?? null,
              body: data.body as string,
              createdAt: data.createdAt as string,
              isSelf,
              attachments: data.attachments ?? [],
            },
          ],
      );
    },
  });

  async function handleSend(): Promise<void> {
    if (sending) return;
    const body = mention.resolveBody(draft).trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if (body.length === 0 && readyAttachments.length === 0) return;
    setSending(true);

    // 전송 시점의 첨부 스냅샷(reload 불필요) — 낙관적 말풍선 표시용.
    const optimisticAttachments = toReadyMessageAttachments(attachments);

    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    const restoreAttachments = attachments;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        authorUserId: viewerUserId,
        authorName: '',
        authorAvatarUpdatedAt: viewerAvatarUpdatedAt,
        body,
        createdAt: new Date().toISOString(),
        isSelf: true,
        attachments: optimisticAttachments,
        pending: true,
      },
    ]);
    setDraft('');
    mention.reset();
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let result: Awaited<ReturnType<typeof sendTeamMessageAction>>;
    try {
      result = await sendTeamMessageAction({
        rfpId,
        body,
        attachmentIds: readyAttachments.map((a) => a.id),
        tempId,
      });
    } catch {
      result = { ok: false, error: 'NETWORK' };
    }
    setSending(false);
    if (result.ok) {
      // pending 말풍선을 확정 교체. 서버 첨부로 갈아끼우고, 라이브 echo 가 먼저
      // 같은 실제 id 를 추가했다면 임시 행은 버린다(중복 방지).
      const serverAttachments = result.attachments ?? optimisticAttachments;
      setLocalMessages((prev) =>
        promoteSentMessage(prev, tempId, result.messageId, result.createdAt, {
          attachments: serverAttachments,
        }),
      );
    } else {
      setLocalMessages((prev) => removeMessage(prev, tempId));
      setDraft(restoreDraft);
      setAttachments(restoreAttachments);
      toast('메모를 남기지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (mention.onKeyDown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      // 한글 IME 조합 확정 Enter(keyCode 229)는 전송이 아니다.
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      void handleSend();
    }
  }

  const canSend =
    !sending &&
    !attachments.some((a) => a.status === 'uploading') &&
    (draft.trim().length > 0 || attachments.some((a) => a.status === 'ready'));

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
                    <Avatar name={m.authorName} size="sm" color="surface" userId={m.authorUserId} avatarUpdatedAt={m.authorAvatarUpdatedAt} />
                    <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {m.authorName}
                    </span>
                  </div>
                )}

                <MessageBubble
                  isSelf={m.isSelf}
                  pending={m.pending}
                  createdAt={m.createdAt}
                  body={m.body}
                  attachments={m.attachments}
                  renderBody={renderTeamBody}
                />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* 첨부 칩 리스트 */}
      {attachments.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] px-3 pt-2 pb-1">
          {attachments.map((a) =>
            a.status === 'uploading' ? (
              <span
                key={a.id}
                aria-busy="true"
                aria-label={`${a.name} 업로드 중`}
                className="inline-flex animate-pulse items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-2 py-1 text-[12px] text-[var(--md-sys-color-on-surface-variant)]"
              >
                <span className="max-w-[160px] truncate">{a.name}</span>
                <Skeleton className="size-3 rounded-full" />
              </span>
            ) : a.status === 'error' ? (
              <span
                key={a.id}
                aria-label={`${a.name} 업로드 실패`}
                title={a.error}
                className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-error)] px-2 py-1 text-[12px] text-[var(--md-sys-color-error)]"
              >
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`${a.name} 첨부 제거`}
                  onClick={() => removeRow(a.id)}
                  className="hover:opacity-70"
                >
                  <XIcon size={12} />
                </button>
              </span>
            ) : (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-[12px] text-[var(--md-sys-color-on-surface)]"
              >
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`${a.name} 첨부 제거`}
                  onClick={() => removeRow(a.id)}
                  className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                >
                  <XIcon size={12} />
                </button>
              </span>
            ),
          )}
        </div>
      )}

      {/* 컴포저 — 첨부 + textarea + 보내기 */}
      <div className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <div className="relative flex items-end gap-2">
          {mention.dropdownVisible && (
            <MentionDropdown
              items={mention.items}
              activeIndex={mention.activeIndex}
              duplicateNames={mention.duplicateNames}
              onPick={mention.pick}
              onHover={mention.onHover}
            />
          )}
          <IconButton
            label="파일 첨부"
            size="sm"
            variant="standard"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_EXT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder="우리 팀에게만 보이는 메모를 남겨보세요…"
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              mention.onTextChange(value, e.target.selectionStart ?? value.length);
            }}
            onKeyDown={handleKeyDown}
            className="min-h-8 max-h-40 flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent px-2.5 py-2 text-[13px] leading-4 text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
          />
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={!canSend}
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
