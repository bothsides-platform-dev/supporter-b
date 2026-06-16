'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Chip } from '@/components/primitives/Chip';
import { IconButton } from '@/components/primitives/IconButton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { Avatar } from '@/components/primitives/Avatar';
import { Paperclip } from 'lucide-react';
import { PaperclipIcon, ArrowUpIcon, ArrowDownIcon, ChevronLeftIcon, CheckIcon, XIcon, EnvelopeIcon } from '@/components/icons';
import { DRAFT_OWNER_ID, ACCEPT_EXT } from '@/lib/server/storage/constants';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { markConversationReadAction } from '@/lib/server/actions/chat/markConversationReadAction';
import { useChatChannel } from '@/lib/hooks/useChatChannel';
import { toast } from '@/lib/toast';
import { COUNTERPARTY_TYPE_LABEL, type ThreadMessage } from './types';
import { AttachmentGalleryPanel } from './AttachmentGalleryPanel';
import { MessageBubble } from './MessageBubble';
import { ContextPanel } from './ContextPanel';
import { useComposerAttachments, toReadyMessageAttachments } from './useComposerAttachments';
import { ChatComposerTextarea } from './ChatComposerTextarea';
import { useStickToBottom } from './useStickToBottom';
import { useStringDraft } from './useStringDraft';
import { promoteSentMessage, removeMessage, applyLiveEcho } from './optimistic-thread';
import { formatDayLabel, withinGroupWindow } from './format';

type Props = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  /** 세션 사용자 — 낙관적 self 말풍선이 즉시 자기 이름을 보여줄 때 쓴다. */
  viewer: { userId: string; name: string };
  messages: ThreadMessage[];
  /** rfpId(uuid) → 표시용 코드/제목. 주어진 항목만 RFP 칩을 렌더(uuid 원문 노출 금지). */
  rfpById?: Record<string, { code: string; title: string }>;
  /** 모바일 단일 컬럼에서 대화 목록으로 돌아가는 콜백(데스크톱에선 미노출). */
  onBack?: () => void;
  /**
   * 'rail' = 상세 화면 우측 채팅 레일 임베드(w-96) — w-64 사이드 갤러리가 말풍선
   * 영역을 짓누르므로 갤러리를 목록 위 오버레이로 전환한다. 기본은 'page'.
   * 'tabs' = 채팅·RFP·파일 탭 3개를 가진 풀 페이지 뷰.
   */
  variant?: 'page' | 'rail' | 'tabs';
  /** tabs 변형에서 RFP 탭에 표시할 컨텍스트 정보. */
  rfpContext?: { code: string; title: string; status?: string; deadline?: string | null };
  /** 레일 컨텍스트의 RFP — 컴포저 전송에 이 RFP 태그를 기본 적용한다. */
  defaultRfpId?: string;
  /**
   * 전송 차단(읽기 전용 컴포저) — 샘플 RFP 의 상대방 채팅 탭에서 데모 PG 에게
   * 실제로 메시지가 가지 않도록 입력·전송을 막고 안내 문구를 표시한다.
   */
  sendDisabled?: boolean;
};

/** Live `message` event payload published by sendChatMessageAction. */
type LiveMessagePayload = {
  type?: string;
  id?: string;
  body?: string;
  authorWsId?: string;
  authorUserId?: string;
  authorName?: string;
  authorEmail?: string;
  rfpId?: string | null;
  createdAt?: string;
  attachments?: { id: string; name: string; size: number; mimeType: string; url: string }[];
  [k: string]: unknown;
};

// Leading-edge throttle window for typing pings — fire immediately on the first
// keystroke, then suppress for this long. NOT a trailing debounce (which would
// only fire after the user *stops* typing — backwards for a live indicator).
const TYPING_THROTTLE_MS = 2000;



// 낙관적 전송 중에만 쓰는 표시 전용 확장 — 서버 로더 타입(ThreadMessage)에는
// pending 개념이 없으므로 클라이언트 뷰 모델로만 둔다.
type LocalMessage = ThreadMessage & { pending?: boolean };

// Capturing group so split keeps the URLs; matched per-part with a
// non-global test (a /g regex carries lastIndex across .test() calls).
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const isUrl = (s: string): boolean => /^https?:\/\//.test(s);

/** 평문 본문 — 줄바꿈은 whitespace-pre-wrap, URL 은 자동 링크. */
function renderBody(body: string): React.ReactNode {
  const parts = body.split(URL_SPLIT);
  return parts.map((part, i) =>
    isUrl(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ThreadView({
  conversationId,
  counterparty,
  viewer,
  messages,
  rfpById,
  onBack,
  variant = 'page',
  rfpContext,
  defaultRfpId,
  sendDisabled = false,
}: Props) {
  // 대화별 초안 보존 — 대화 전환(remount) 시에도 작성 중이던 내용을 잃지 않는다.
  const draftKey = `chat-draft:${conversationId}`;
  const [draft, setDraft] = useStringDraft(draftKey);
  const {
    rows: attachments,
    setRows: setAttachments,
    addFiles,
    removeRow,
  } = useComposerAttachments({ ownerKind: 'chat', ownerId: DRAFT_OWNER_ID });
  const [sending, setSending] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'rfp' | 'files'>('chat');

  // Local copy so live receives + optimistic sends append without a refetch.
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(messages);
  // Track the messages prop identity to resync local state when it changes
  // (MessageInbox renders [] first, then the loaded thread for the SAME
  // conversationId — no remount). setState during render causes React to
  // restart the render immediately with no extra committed paint.
  const [prevMessages, setPrevMessages] = useState<ThreadMessage[]>(messages);
  if (prevMessages !== messages) {
    setPrevMessages(messages);
    setLocalMessages(messages);
  }
  // Live read watermark (ms epoch): the counterparty's "read" event carries no
  // timestamp, so treat its arrival time as "read up to now".
  const [readAt, setReadAt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentAt = useRef(0);
  // 새 메시지 append 시 하단 자동 추적. 위로 올려 과거 글 읽는 중엔 점프하지 않고
  // "새 메시지" pill 만 띄운다(useStickToBottom).
  const lastIsOwn = localMessages[localMessages.length - 1]?.sender === 'self';
  const { listRef, bottomRef, showNewMessagePill, scrollToBottom, onListScroll } =
    useStickToBottom({ count: localMessages.length, isOwnLast: lastIsOwn, withPill: true });

  // Live channel — graceful no-op when realtime is unconfigured (dev/tests):
  // online stays false, typingUserIds empty, onMessage/onRead never fire, and
  // the thread runs entirely off the static loader + optimistic local append.
  const { online, typingUserIds, sendTyping, connected } = useChatChannel(conversationId, {
    onMessage: (data: LiveMessagePayload) => {
      if (!data.id || typeof data.body !== 'string' || !data.createdAt) return;
      const id = data.id;
      const sender: ThreadMessage['sender'] =
        data.authorWsId === counterparty.workspaceId ? 'other' : 'self';
      // Centrifugo recovery can redeliver, and handleSend may have already
      // promoted the pending bubble to this id → dedup. 본인 echo 면 tempId 로
      // 정확 매칭 후 확정 승격(append 하면 중복), 아니면 새로 append.
      setLocalMessages(
        (prev) =>
          applyLiveEcho(prev, id, sender === 'self', data.createdAt as string, data.tempId as string | undefined) ?? [
            ...prev,
            {
              id,
              authorUserId: data.authorUserId ?? '',
              authorName: data.authorName ?? '',
              authorEmail: data.authorEmail ?? '',
              sender,
              body: data.body as string,
              rfpId: data.rfpId ?? null,
              createdAt: data.createdAt as string,
              readByCounterparty: false,
              attachments: data.attachments ?? [],
            },
          ],
      );
    },
    onRead: (data) => {
      // Use the server-issued timestamp from the payload to avoid client clock
      // skew. Fall back to Date.now() only if the server omits readAt
      // (e.g. older server during a rolling deploy).
      const ts = typeof data.readAt === 'string' ? Date.parse(data.readAt) : Date.now();
      setReadAt(ts);
    },
  });

  // Mark-read on open: clears my unread + publishes a read receipt to the
  // counterparty. Once per conversation (MessageInbox keys ThreadView by
  // conversationId so a switch remounts and re-fires).
  useEffect(() => {
    void markConversationReadAction({ conversationId });
  }, [conversationId]);


  // 읽음 영수증을 붙일 인덱스: 마지막 *읽힌* 보낸 메시지(절대 마지막 보낸
  // 메시지가 아님). 상대 last_read_at 이 두 발신 사이에 떨어지면 로더가 메시지별
  // readByCounterparty 를 다르게 매기므로(앞선 건 true, 이후 건 false), "마지막
  // self" 기준이면 영수증이 통째로 사라진다. 라이브 read 이벤트는 readAt 워터마크로
  // 그 시점 이하의 메시지를 모두 읽음 처리한다.
  const receiptIndex = useMemo(
    () =>
      localMessages.findLastIndex(
        (m) =>
          m.sender === 'self' &&
          (m.readByCounterparty || (readAt > 0 && Date.parse(m.createdAt) <= readAt)),
      ),
    [localMessages, readAt],
  );

  const totalAttachmentCount = useMemo(
    () => localMessages.reduce((sum, m) => sum + m.attachments.length, 0),
    [localMessages],
  );

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (sending || sendDisabled) return;
    // 업로드가 끝난(ready) 첨부만 전송한다 — 임시(uploading) 행의 tempId 가
    // 서버로 새지 않도록.
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if (body.length === 0 && readyAttachments.length === 0) return;
    setSending(true);

    // 전송 시점의 첨부를 표시용으로 스냅샷(reload 불필요).
    const optimisticAttachments = toReadyMessageAttachments(attachments);
    // 낙관적 말풍선을 *전송 전*에 'pending' 으로 올려 "전송 중"을 즉시 보여준다.
    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    const restoreAttachments = attachments;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        authorUserId: viewer.userId,
        authorName: viewer.name,
        authorEmail: '',
        sender: 'self',
        body,
        rfpId: defaultRfpId ?? null,
        createdAt: new Date().toISOString(),
        readByCounterparty: false,
        attachments: optimisticAttachments,
        pending: true,
      },
    ]);
    // 컴포저는 즉시 비운다(표준 메신저 동작). 실패하면 아래에서 되돌린다.
    setDraft('');
    setAttachments([]);

    let result: Awaited<ReturnType<typeof sendChatMessageAction>>;
    try {
      result = await sendChatMessageAction({
        conversationId,
        body,
        attachmentIds: readyAttachments.map((a) => a.id),
        rfpId: defaultRfpId,
        tempId,
      });
    } catch {
      setSending(false);
      setLocalMessages((prev) => removeMessage(prev, tempId));
      setDraft(restoreDraft);
      setAttachments(restoreAttachments);
      toast('메시지를 보내지 못했어요. 다시 시도해 주세요.', { type: 'error' });
      return;
    }
    setSending(false);
    if (result.ok) {
      // pending 말풍선을 확정으로 교체(실서버 id + pending 해제). 라이브 echo 가
      // 먼저 같은 실제 id 를 추가했다면 임시 행은 버린다(중복 방지).
      setLocalMessages((prev) => promoteSentMessage(prev, tempId, result.messageId, result.createdAt));
    } else {
      // 실패: 낙관적 말풍선을 제거하고 입력·첨부를 복원해 다시 보낼 수 있게 한다.
      setLocalMessages((prev) => removeMessage(prev, tempId));
      setDraft(restoreDraft);
      setAttachments(restoreAttachments);
      toast('메시지를 보내지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  // Leading-edge throttle: ping typing on the first keystroke, then suppress
  // repeats for the window. Avoids one publish per keystroke.
  const handleTyping = useCallback((): void => {
    const now = Date.now();
    if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return;
    lastTypingSentAt.current = now;
    sendTyping();
  }, [sendTyping]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 헤더 — 상대 워크스페이스 + 타입 + 프레즌스 + 타이핑 */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        {onBack && (
          <button
            type="button"
            aria-label="대화 목록"
            onClick={onBack}
            className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] md:hidden"
          >
            <ChevronLeftIcon size={18} />
          </button>
        )}
        <div className="relative">
          <WorkspaceAvatar name={counterparty.name} size="md" workspaceId={counterparty.workspaceId} />
          {online && (
            <span
              aria-label="온라인"
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--md-sys-color-surface)] bg-[var(--md-sys-color-tertiary)]"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
              {counterparty.name}
            </span>
            <Chip label={COUNTERPARTY_TYPE_LABEL[counterparty.type]} color="surface" />
          </div>
          {typingUserIds.length > 0 && (
            <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">입력 중…</span>
          )}
        </div>
        {variant === 'rail' && totalAttachmentCount > 0 && (
          <button
            type="button"
            onClick={() => setShowGallery((v) => !v)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-[var(--md-sys-shape-small)] px-2 py-1 text-[12px] transition-colors',
              showGallery
                ? 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]',
            )}
          >
            <PaperclipIcon size={13} />
            <span className="md-numeric">파일 {totalAttachmentCount}</span>
          </button>
        )}
        {variant === 'tabs' && (
          <div role="tablist" className="ml-auto flex items-center gap-0.5">
            {(['chat', 'rfp', 'files'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                type="button"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-[var(--md-sys-shape-small)] px-2.5 py-1 text-[11px] transition-colors',
                  activeTab === tab
                    ? 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-low)]',
                )}
              >
                {tab === 'chat' ? '채팅' : tab === 'rfp' ? 'RFP' : '파일'}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* 탭 변형: RFP 컨텍스트 패널 */}
      {variant === 'tabs' && activeTab === 'rfp' && (
        <div className="flex-1 overflow-y-auto">
          <ContextPanel conversationId={conversationId} rfpContext={rfpContext} />
        </div>
      )}

      {/* 탭 변형: 파일 패널 */}
      {variant === 'tabs' && activeTab === 'files' && (
        <div className="flex-1 overflow-y-auto p-3">
          <AttachmentGalleryPanel conversationId={conversationId} />
        </div>
      )}

      {/* 말풍선 목록 — tabs 변형에서는 채팅 탭일 때만 표시 */}
      {(variant !== 'tabs' || activeTab === 'chat') && (<>
      <div className="relative flex-1 overflow-hidden">
      <div
        ref={listRef}
        data-message-list
        onScroll={onListScroll}
        className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {localMessages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<EnvelopeIcon />}
              title="아직 주고받은 메시지가 없어요"
              description="첫 메시지를 보내 대화를 시작해보세요."
            />
          </div>
        )}
        {localMessages.map((m, i) => {
          const isSelf = m.sender === 'self';
          // Group on the *displayed* day label so the divider key and the
          // rendered label can never diverge across a TZ midnight boundary.
          // Derived from the previous message (no mutable outer var) to stay
          // React-Compiler-pure.
          const dayLabel = formatDayLabel(m.createdAt);
          const prev = i > 0 ? localMessages[i - 1] : null;
          const prevDayLabel = prev ? formatDayLabel(prev.createdAt) : null;
          const showDivider = dayLabel !== prevDayLabel;
          // 같은 상대가 짧은 간격으로 연속해 보낸 메시지는 하나의 묶음으로 보고
          // 이름·아바타 헤더를 두 번째부터 생략한다(날짜 경계서 리셋). 시간 판정은
          // TeamThreadView 와 공유(withinGroupWindow — 드리프트 방지 단일 출처).
          // 작성자(authorUserId) 기준 그룹핑 — 같은 회사라도 담당자가 다르면
          // 묶음·헤더를 분리한다. 양쪽(self·other) 모두 작성자 헤더를 단다.
          const groupedWithPrev =
            !!prev &&
            prev.authorUserId === m.authorUserId &&
            !showDivider &&
            withinGroupWindow(prev.createdAt, m.createdAt);
          const showAuthorHeader = !groupedWithPrev;
          const rfp = m.rfpId ? rfpById?.[m.rfpId] : undefined;
          // Receipt only on the last *read* self message (receiptIndex).
          const showReceipt = i === receiptIndex;

          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDivider && (
                // 중앙 라벨만 — 플랭킹 라인 없는 절제된 구분선(레퍼런스 정합).
                <div role="separator" className="flex justify-center py-1.5">
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {dayLabel}
                  </span>
                </div>
              )}

              <div
                data-message-row
                data-sender={m.sender}
                className={cn('flex flex-col gap-1', isSelf ? 'items-end' : 'items-start')}
              >
                {showAuthorHeader && (
                  <div className="flex items-center gap-1.5">
                    <Avatar name={m.authorName} size="sm" color={isSelf ? 'primary' : 'surface'} />
                    <span
                      title={m.authorEmail || undefined}
                      className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]"
                    >
                      {m.authorName}
                    </span>
                  </div>
                )}

                {rfp && (
                  <div className="w-full">
                    <Chip
                      color="surface"
                      icon={<span className="md-numeric">{rfp.code}</span>}
                      label={rfp.title}
                      className="max-w-[78%]"
                    />
                  </div>
                )}

                <MessageBubble
                  isSelf={isSelf}
                  pending={m.pending}
                  createdAt={m.createdAt}
                  body={m.body}
                  attachments={m.attachments}
                  renderBody={renderBody}
                />

                {showReceipt && (
                  <span className="flex items-center gap-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <CheckIcon size={12} />
                    읽음
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} data-message-bottom aria-hidden />
      </div>

      {showNewMessagePill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[var(--md-sys-shape-full)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface)] shadow-[var(--md-sys-elevation-2)] transition-colors hover:bg-[var(--md-sys-color-surface-container-highest)]"
        >
          <ArrowDownIcon size={13} />
          새 메시지
        </button>
      )}

      {/* 레일 변형 갤러리 — w-64 사이드 패널이 좁은 레일을 짓누르므로 목록 위
          오버레이로 전환(기능 동일, 폭 손실 없음). */}
      {variant === 'rail' && showGallery && (
        <div
          data-gallery-overlay
          className="absolute inset-0 z-10 overflow-y-auto bg-[var(--md-sys-color-surface)] p-3"
        >
          <AttachmentGalleryPanel conversationId={conversationId} />
        </div>
      )}
      </div>

      {/* 연결 끊김 배너 */}
      {connected === false && (
        <div
          role="status"
          className="shrink-0 px-4 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]"
        >
          채팅 서버와 연결이 끊겼습니다. 재연결 중…
        </div>
      )}

      {/* 첨부 칩 리스트 */}
      {attachments.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] px-3 pt-2 pb-1">
          {attachments.map((a) =>
            a.status === 'uploading' ? (
              // 업로드 중 — 파일명 + 펄스 스켈레톤(제거 불가, 올리는 중임을 표시).
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
              // 업로드 실패 — 에러 메시지 + 제거 버튼.
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

      {/* 샘플 안내 — 데모 PG 에게는 실제로 보내지지 않음 */}
      {sendDisabled && (
        <p className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          샘플에서는 메시지를 보낼 수 없어요. 실제 견적 요청을 보내보세요.
        </p>
      )}

      {/* 하단 인라인 컴포저 */}
      <div className="flex shrink-0 items-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <IconButton
          label="파일 첨부"
          size="sm"
          variant="standard"
          className="shrink-0"
          disabled={sendDisabled}
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
        <ChatComposerTextarea
          value={draft}
          onChange={(v) => {
            setDraft(v);
            handleTyping();
          }}
          onSubmit={handleSend}
          disabled={sendDisabled}
          placeholder="메시지를 입력하세요…"
          className="max-h-40 min-h-8 box-border flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-1.5 text-[13px] leading-4 text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)] disabled:opacity-60"
        />
        <Button
          className="shrink-0"
          onClick={handleSend}
          disabled={
            sendDisabled ||
            sending ||
            attachments.some((a) => a.status === 'uploading') ||
            (draft.trim().length === 0 && !attachments.some((a) => a.status === 'ready'))
          }
          aria-label="보내기"
        >
          <ArrowUpIcon size={16} />
          보내기
        </Button>
      </div>
      </>)}
    </div>
    </div>
  );
}
