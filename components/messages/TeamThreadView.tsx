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
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserProfileCard } from '@/components/profile/UserProfileCard';
import { IconButton } from '@/components/primitives/IconButton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Users, Paperclip } from 'lucide-react';
import { ArrowUpIcon } from '@/components/icons';
import { ACCEPT_EXT } from '@/lib/server/storage/constants';
import { sendTeamMessageAction } from '@/lib/server/actions/chat/sendTeamMessageAction';
import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';
import { useTeamChannel, type TeamLivePayload } from '@/lib/hooks/useTeamChannel';
import { toast } from '@/lib/toast';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';
import { MessageBubble } from './MessageBubble';
import { ComposerAttachmentChips } from './ComposerAttachmentChips';
import { useComposerAttachments, toReadyMessageAttachments } from './useComposerAttachments';
import { useStickToBottom } from './useStickToBottom';
import { promoteSentMessage, removeMessage, applyLiveEcho } from './optimistic-thread';
import { computeMessageGrouping } from './message-grouping';
import { MorphFlightLayer } from './MorphFlightLayer';
import { useMessageMorph } from './useMessageMorph';
import type { Rect } from './message-morph';
import { useAutoGrowTextarea } from './useAutoGrowTextarea';
import { DateDivider } from './DateDivider';
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


// localKey — tempId→realId 승격에도 React key·morph 타깃 매칭을 고정하는 안정 키.
type LocalMessage = TeamThreadMessage & { pending?: boolean; localKey?: string };

export function TeamThreadView({ rfpId, workspaceId, viewerUserId, viewerAvatarUpdatedAt, messages, teamMembers = [] }: Props) {
  const [draft, setDraft] = useState('');
  const {
    rows: attachments,
    setRows: setAttachments,
    addFiles,
    removeRow,
    readyRows,
    anyUploading,
  } = useComposerAttachments({ ownerKind: 'team_message', ownerId: rfpId });
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(messages);
  const { ref: textareaRef, resize: resizeTextarea } = useAutoGrowTextarea(draft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastIsOwn = localMessages[localMessages.length - 1]?.isSelf ?? false;
  const { listRef, bottomRef } = useStickToBottom({
    count: localMessages.length,
    isOwnLast: lastIsOwn,
  });

  // 전송 morph — 입력 텍스트가 말풍선으로 변신. useStickToBottom *뒤*에 둬야 측정 effect가
  // 자동 스크롤 적용 후 실행된다. 출발 위치는 textareaRef(입력창)를 직접 측정.
  const reduce = useReducedMotion();
  const { flights, beginFlight, endFlight, isMorphing } = useMessageMorph();
  const [pendingFlight, setPendingFlight] = useState<{ key: string; text: string; from: Rect } | null>(null);

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
    if (body.length === 0 && readyRows.length === 0) return;
    setSending(true);

    // morph 출발점 — 텍스트가 아직 입력창에 있는 지금(append/clear 전) 측정.
    const cr = textareaRef.current?.getBoundingClientRect();
    const fromRect: Rect | null = cr
      ? { left: cr.left, top: cr.top, width: cr.width, height: cr.height }
      : null;

    // 전송 시점의 첨부 스냅샷(reload 불필요) — 낙관적 말풍선 표시용.
    const optimisticAttachments = toReadyMessageAttachments(attachments);

    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    const restoreAttachments = attachments;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        localKey: tempId,
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
    // 텍스트가 있으면 morph 발동 예약 — 말풍선 안착 후 effect가 위치 측정.
    if (fromRect && body.length > 0) setPendingFlight({ key: tempId, text: body, from: fromRect });
    // 높이 리셋은 useAutoGrowTextarea 가 draft='' 효과로 처리한다.

    let result: Awaited<ReturnType<typeof sendTeamMessageAction>>;
    try {
      result = await sendTeamMessageAction({
        rfpId,
        body,
        attachmentIds: readyRows.map((a) => a.id),
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
      endFlight(tempId); // 진행 중인 morph 클론도 함께 정리(롤백된 말풍선과 짝).
      setDraft(restoreDraft);
      setAttachments(restoreAttachments);
      toast('메모를 남기지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  // 낙관적 말풍선이 안착하고(useStickToBottom 자동 스크롤 후) 위치를 측정해 morph 발동.
  // useStickToBottom 보다 *뒤*에 선언돼 스크롤 적용 후 실행되는 것이 핵심.
  useEffect(() => {
    if (!pendingFlight) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-bubble-key="${pendingFlight.key}"]`);
    beginFlight({
      key: pendingFlight.key,
      text: pendingFlight.text,
      from: pendingFlight.from,
      isSelf: true,
      reduce: reduce ?? false,
      bubbleEl: el ?? null,
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 측정→발동 패턴: 낙관적 말풍선 안착 + 자동 스크롤 적용 후(이 effect가 useStickToBottom 뒤) 위치를 측정해 morph를 1회 발동하고 예약을 비운다(바운드된 1회성 후속 렌더).
    setPendingFlight(null);
  }, [pendingFlight, beginFlight, reduce, listRef]);

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
    !anyUploading &&
    (draft.trim().length > 0 || readyRows.length > 0);

  // 날짜 구분선·묶음 파생 — ThreadView 와 공유하는 단일 출처(드리프트 방지).
  const grouping = computeMessageGrouping(localMessages);

  return (
    <>
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
          // 날짜 구분선·묶음 판정은 computeMessageGrouping 단일 출처(ThreadView 공유).
          // 내부 스레드라 self 헤더는 숨긴다(상대 메시지에만 작성자 표시).
          const { showDivider, dayLabel, groupedWithPrev } = grouping[i];
          const showAuthorHeader = !m.isSelf && !groupedWithPrev;
          const rowKey = m.localKey ?? m.id; // 승격에도 불변(React key·morph 타깃)

          return (
            <div key={rowKey} className="flex flex-col gap-3">
              {showDivider && <DateDivider label={dayLabel} />}

              <div
                data-message-row
                data-sender={m.isSelf ? 'self' : 'other'}
                className={cn('flex flex-col gap-1', m.isSelf ? 'items-end' : 'items-start')}
              >
                {showAuthorHeader && (
                  <div className="flex items-center gap-1.5">
                    <UserProfileCard name={m.authorName} size="sm" color="surface" userId={m.authorUserId} avatarUpdatedAt={m.authorAvatarUpdatedAt} />
                    <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {m.authorName}
                    </span>
                  </div>
                )}

                {/* morph 진행 중인 self 말풍선은 숨김 — 떠오르는 클론으로 대체(안착 후 복귀). */}
                <div className={cn('w-full', m.isSelf && isMorphing(rowKey) && 'opacity-0')}>
                  <MessageBubble
                    isSelf={m.isSelf}
                    pending={m.pending}
                    createdAt={m.createdAt}
                    body={m.body}
                    attachments={m.attachments}
                    renderBody={renderTeamBody}
                    bubbleKey={rowKey}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} aria-hidden />
      </div>

      {/* 첨부 칩 리스트 */}
      <ComposerAttachmentChips rows={attachments} onRemove={removeRow} />

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
              resizeTextarea();
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
    <MorphFlightLayer flights={flights} onDone={endFlight} renderText={renderTeamBody} />
    </>
  );
}
