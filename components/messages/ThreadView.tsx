'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { http } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Chip } from '@/components/primitives/Chip';
import { EmptyState } from '@/components/primitives/EmptyState';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { PaperclipIcon, ArrowUpIcon, ArrowDownIcon, ChevronLeftIcon, CheckIcon, XIcon, EnvelopeIcon } from '@/components/icons';
import { DRAFT_OWNER_ID, MAX_FILES, MAX_BYTES, ACCEPT_EXT, ACCEPTED_MIMES } from '@/lib/server/storage/constants';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { markConversationReadAction } from '@/lib/server/actions/chat/markConversationReadAction';
import { useChatChannel } from '@/lib/hooks/useChatChannel';
import { toast } from '@/lib/toast';
import { COUNTERPARTY_TYPE_LABEL, type ThreadMessage } from './types';
import { AttachmentGalleryPanel } from './AttachmentGalleryPanel';

type Props = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  messages: ThreadMessage[];
  /** rfpId(uuid) → 표시용 코드/제목. 주어진 항목만 RFP 칩을 렌더(uuid 원문 노출 금지). */
  rfpById?: Record<string, { code: string; title: string }>;
  /** 모바일 단일 컬럼에서 대화 목록으로 돌아가는 콜백(데스크톱에선 미노출). */
  onBack?: () => void;
};

/** Live `message` event payload published by sendChatMessageAction. */
type LiveMessagePayload = {
  type?: string;
  id?: string;
  body?: string;
  authorWsId?: string;
  rfpId?: string | null;
  createdAt?: string;
  [k: string]: unknown;
};

// Leading-edge throttle window for typing pings — fire immediately on the first
// keystroke, then suppress for this long. NOT a trailing debounce (which would
// only fire after the user *stops* typing — backwards for a live indicator).
const TYPING_THROTTLE_MS = 2000;

// 같은 상대의 연속 메시지를 한 묶음으로 보는 최대 간격(이내면 헤더 생략).
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// 하단에서 이만큼(px) 이내면 "하단 근처"로 보고 새 메시지를 자동 추적한다.
const NEAR_BOTTOM_PX = 120;

// 낙관적 전송 중에만 쓰는 표시 전용 확장 — 서버 로더 타입(ThreadMessage)에는
// pending 개념이 없으므로 클라이언트 뷰 모델로만 둔다.
type LocalMessage = ThreadMessage & { pending?: boolean };

// Composer attachment row. `id` is a temp id while `status === 'uploading'`
// (no server id/url/mime yet), swapped for the real attachment id once ready.
type Attachment = {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  url?: string;
  status: 'uploading' | 'ready';
};

// Capturing group so split keeps the URLs; matched per-part with a
// non-global test (a /g regex carries lastIndex across .test() calls).
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const isUrl = (s: string): boolean => /^https?:\/\//.test(s);

/** 메시지 버블 내 컴팩트 첨부파일 그리드 — 헤더 없음, 2열 소형 타일. */
function ChatAttachmentGrid({ attachments }: { attachments: { id: string; name: string; mimeType: string; url: string }[] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {attachments.map((att) => {
        const isImage = att.mimeType?.startsWith('image/');
        return (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 overflow-hidden rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 py-1.5 transition-colors hover:border-[var(--md-sys-color-outline)]"
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={att.url} alt={att.name} className="h-8 w-8 shrink-0 rounded-sm object-cover" />
            ) : (
              <PaperclipIcon size={14} className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]" />
            )}
            <span className="min-w-0 truncate text-[11px] text-[var(--md-sys-color-on-surface)]">
              {att.name}
            </span>
          </a>
        );
      })}
    </div>
  );
}

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

/** "5월 26일 월요일" 형태 (KST 캘린더 일자 기준 그룹 키와 동일 포맷). */
function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

export function ThreadView({
  conversationId,
  counterparty,
  messages,
  rfpById,
  onBack,
}: Props) {
  // 대화별 초안 보존 — 대화 전환(remount) 시에도 작성 중이던 내용을 잃지 않는다.
  const draftKey = `chat-draft:${conversationId}`;
  const [draft, setDraft] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(draftKey) ?? '';
    } catch {
      return '';
    }
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSentAt = useRef(0);
  // 자동 스크롤: 리스트 컨테이너 + 하단 sentinel. prevLen 으로 "새 메시지 도착"을
  // 감지하고, "하단 근처"일 때만 자동으로 따라간다(위로 올려 과거 글 읽는 중엔 점프 금지).
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  const isNearBottom = useCallback((): boolean => {
    const el = listRef.current;
    if (!el) return true; // 메트릭 없으면(초기/jsdom) 하단으로 간주
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  const scrollToBottom = useCallback((): void => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
    setShowNewMessagePill(false);
  }, []);

  // 새 메시지(append)에만 반응: 최초 로드/본인 전송/하단 근처면 따라가고,
  // 위로 올려둔 상태에서 상대 메시지가 오면 "새 메시지" pill 만 띄운다.
  useEffect(() => {
    const grew = localMessages.length > prevLenRef.current;
    const isInitial = prevLenRef.current === 0;
    prevLenRef.current = localMessages.length;
    if (!grew) return;
    const last = localMessages[localMessages.length - 1];
    const ownSend = last?.sender === 'self';
    if (isInitial || ownSend || isNearBottom()) {
      scrollToBottom();
    } else {
      setShowNewMessagePill(true);
    }
  }, [localMessages, isNearBottom, scrollToBottom]);

  // 사용자가 직접 하단으로 스크롤하면 pill 을 거둔다.
  const handleListScroll = useCallback((): void => {
    if (isNearBottom()) setShowNewMessagePill(false);
  }, [isNearBottom]);

  // Live channel — graceful no-op when realtime is unconfigured (dev/tests):
  // online stays false, typingUserIds empty, onMessage/onRead never fire, and
  // the thread runs entirely off the static loader + optimistic local append.
  const { online, typingUserIds, sendTyping, connected } = useChatChannel(conversationId, {
    onMessage: (data: LiveMessagePayload) => {
      if (!data.id || typeof data.body !== 'string' || !data.createdAt) return;
      const id = data.id;
      const sender: ThreadMessage['sender'] =
        data.authorWsId === counterparty.workspaceId ? 'other' : 'self';
      setLocalMessages((prev) => {
        // Dedup by id — Centrifugo recovery can redeliver, and the reconcile in
        // handleSend may have already promoted the pending bubble to this id.
        if (prev.some((m) => m.id === id)) return prev;
        // 본인 메시지의 echo: 진행 중 pending 말풍선을 확정으로 승격(실제 id 부여,
        // 첨부 등 표시 상태 보존) — 새로 append 하면 중복이 된다. `sending` 가드
        // 덕에 진행 중 self pending 은 항상 최대 1개.
        if (sender === 'self') {
          const pendingIdx = prev.findIndex((m) => m.pending);
          if (pendingIdx >= 0) {
            const next = prev.slice();
            next[pendingIdx] = { ...next[pendingIdx], id, pending: false };
            return next;
          }
        }
        return [
          ...prev,
          {
            id,
            sender,
            body: data.body as string,
            rfpId: data.rfpId ?? null,
            createdAt: data.createdAt as string,
            readByCounterparty: false,
            attachments: [],
          },
        ];
      });
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

  // 초안을 localStorage 에 동기 반영(디바운스 없이 — 메시지 길이는 짧아 비용이
  // 작고, 디바운스 타이밍에 의존하는 테스트 플레이크도 피한다). 비면 제거한다.
  useEffect(() => {
    try {
      if (draft) window.localStorage.setItem(draftKey, draft);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // localStorage 접근 불가(프라이빗 모드 등) — 보존 없이 동작.
    }
  }, [draft, draftKey]);

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

  async function uploadOne(file: File, tempId: string): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', 'chat');
    form.append('ownerId', DRAFT_OWNER_ID);
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string; size: number; mimeType: string }>();
      // 임시 행을 서버 첨부로 교체(스켈레톤 → 일반 칩).
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === tempId
            ? {
                id: body.id,
                name: body.name,
                size: body.size,
                mimeType: body.mimeType,
                url: `/api/files/${body.id}`,
                status: 'ready',
              }
            : a,
        ),
      );
    } catch {
      // 업로드 실패: 임시 행(스켈레톤)을 제거하고 에러 토스트로 알린다.
      setAttachments((prev) => prev.filter((a) => a.id !== tempId));
      toast('파일을 올리지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  function addFiles(list: FileList | null): void {
    if (!list) return;
    const remaining = MAX_FILES - attachments.length;
    const additions: Attachment[] = [];
    for (let i = 0; i < Math.min(list.length, remaining); i++) {
      const f = list[i];
      if (!ACCEPTED_MIMES.has(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      // 선택 즉시 'uploading' 행(스켈레톤)을 추가해 올리는 중임을 보여준다.
      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      additions.push({ id: tempId, name: f.name, size: f.size, status: 'uploading' });
      void uploadOne(f, tempId);
    }
    if (additions.length > 0) setAttachments((prev) => [...prev, ...additions]);
  }

  function autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (sending) return;
    // 업로드가 끝난(ready) 첨부만 전송한다 — 임시(uploading) 행의 tempId 가
    // 서버로 새지 않도록.
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if (body.length === 0 && readyAttachments.length === 0) return;
    setSending(true);

    // 전송 시점의 첨부를 표시용으로 스냅샷(reload 불필요).
    const optimisticAttachments = attachments.flatMap((a) =>
      a.size !== undefined && a.mimeType && a.url
        ? [{ id: a.id, name: a.name, size: a.size, mimeType: a.mimeType, url: a.url }]
        : [],
    );
    // 낙관적 말풍선을 *전송 전*에 'pending' 으로 올려 "전송 중"을 즉시 보여준다.
    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    const restoreAttachments = attachments;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender: 'self',
        body,
        rfpId: null,
        createdAt: new Date().toISOString(),
        readByCounterparty: false,
        attachments: optimisticAttachments,
        pending: true,
      },
    ]);
    // 컴포저는 즉시 비운다(표준 메신저 동작). 실패하면 아래에서 되돌린다.
    setDraft('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const result = await sendChatMessageAction({
      conversationId,
      body,
      attachmentIds: readyAttachments.map((a) => a.id),
    });
    setSending(false);
    if (result.ok) {
      // pending 말풍선을 확정으로 교체(실서버 id + pending 해제). 라이브 echo 가
      // 먼저 같은 실제 id 를 추가했다면 임시 행은 버린다(중복 방지).
      const newId = result.messageId;
      setLocalMessages((prev) => {
        const hasReal = prev.some((m) => m.id === newId);
        return prev.flatMap((m) =>
          m.id === tempId ? (hasReal ? [] : [{ ...m, id: newId, pending: false }]) : [m],
        );
      });
    } else {
      // 실패: 낙관적 말풍선을 제거하고 입력·첨부를 복원해 다시 보낼 수 있게 한다.
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex h-full min-w-0">
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 헤더 — 상대 워크스페이스 + 타입 + 프레즌스 + 타이핑 */}
      <header className="flex items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
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
        {totalAttachmentCount > 0 && (
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
      </header>

      {/* 말풍선 목록 */}
      <div className="relative flex-1 overflow-hidden">
      <div
        ref={listRef}
        data-message-list
        onScroll={handleListScroll}
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
          // 같은 상대가 짧은 간격(GROUP_WINDOW_MS)으로 연속해 보낸 메시지는 하나의
          // 묶음으로 보고 이름·아바타 헤더를 두 번째부터 생략한다(날짜 경계서 리셋).
          const groupedWithPrev =
            !!prev &&
            prev.sender === m.sender &&
            !showDivider &&
            Date.parse(m.createdAt) - Date.parse(prev.createdAt) <= GROUP_WINDOW_MS;
          const showSenderHeader = !isSelf && !groupedWithPrev;
          const rfp = m.rfpId ? rfpById?.[m.rfpId] : undefined;
          // Receipt only on the last *read* self message (receiptIndex).
          const showReceipt = i === receiptIndex;

          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDivider && (
                <div role="separator" className="flex items-center gap-2 py-1">
                  <span className="h-px flex-1 bg-[var(--md-sys-color-outline-variant)]" />
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {dayLabel}
                  </span>
                  <span className="h-px flex-1 bg-[var(--md-sys-color-outline-variant)]" />
                </div>
              )}

              <div
                data-message-row
                data-sender={m.sender}
                className={cn('flex flex-col gap-1', isSelf ? 'items-end' : 'items-start')}
              >
                {showSenderHeader && (
                  <div className="flex items-center gap-1.5">
                    <WorkspaceAvatar
                      name={counterparty.name}
                      size="sm"
                      workspaceId={counterparty.workspaceId}
                    />
                    <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
                      {counterparty.name}
                    </span>
                    <span className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {formatTime(m.createdAt)}
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

                <div className={cn('flex items-end gap-1.5 w-full', isSelf && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'max-w-[78%] whitespace-pre-wrap break-words rounded-[var(--md-sys-shape-medium)] px-3 py-2 text-[13px] leading-relaxed',
                      'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]',
                      isSelf &&
                        'bg-[var(--md-sys-color-surface-container-high)]',
                      m.pending && 'opacity-60',
                    )}
                  >
                    {renderBody(m.body)}
                    {m.attachments.length > 0 && (
                      <ChatAttachmentGrid attachments={m.attachments} />
                    )}
                  </div>
                  {isSelf &&
                    (m.pending ? (
                      <span
                        aria-label="전송 중"
                        className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--md-sys-color-on-surface-variant)]"
                      />
                    ) : (
                      <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        {formatTime(m.createdAt)}
                      </span>
                    ))}
                </div>

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
      </div>

      {/* 연결 끊김 배너 */}
      {connected === false && (
        <div
          role="status"
          className="px-4 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]"
        >
          채팅 서버와 연결이 끊겼습니다. 재연결 중…
        </div>
      )}

      {/* 첨부 칩 리스트 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--md-sys-color-outline-variant)] px-3 pt-2">
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
            ) : (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-[12px] text-[var(--md-sys-color-on-surface)]"
              >
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  type="button"
                  aria-label={`${a.name} 첨부 제거`}
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                >
                  <XIcon size={12} />
                </button>
              </span>
            ),
          )}
        </div>
      )}

      {/* 하단 인라인 컴포저 */}
      <div className="flex items-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <button
          type="button"
          aria-label="파일 첨부"
          onClick={() => fileInputRef.current?.click()}
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
        >
          <PaperclipIcon size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_EXT}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autoGrow(e.target);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요…"
          rows={1}
          className="max-h-40 flex-1 resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={
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
    </div>

    {/* 우측 첨부파일 갤러리 패널 */}
    {showGallery && (
      <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-[var(--md-sys-color-outline-variant)] p-3">
        <AttachmentGalleryPanel conversationId={conversationId} />
      </div>
    )}
    </div>
  );
}
