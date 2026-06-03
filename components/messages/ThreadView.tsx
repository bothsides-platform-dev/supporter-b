'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { PaperclipIcon, ArrowUpIcon, CheckIcon, XIcon } from '@/components/icons';
import { DRAFT_OWNER_ID, MAX_FILES, MAX_BYTES, ACCEPT_EXT, ACCEPTED_MIMES } from '@/lib/server/storage/constants';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { markConversationReadAction } from '@/lib/server/actions/chat/markConversationReadAction';
import { useChatChannel } from '@/lib/hooks/useChatChannel';
import { COUNTERPARTY_TYPE_LABEL, type ThreadMessage } from './types';

type Props = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  messages: ThreadMessage[];
  /** rfpId(uuid) → 표시용 코드/제목. 주어진 항목만 RFP 칩을 렌더(uuid 원문 노출 금지). */
  rfpById?: Record<string, { code: string; title: string }>;
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

type Attachment = { id: string; name: string };

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
}: Props) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  // Local copy so live receives + optimistic sends append without a refetch.
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>(messages);
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
        // Dedup by id — the sender's own send already appended optimistically,
        // and Centrifugo recovery can redeliver.
        if (prev.some((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            sender,
            body: data.body as string,
            rfpId: data.rfpId ?? null,
            createdAt: data.createdAt as string,
            readByCounterparty: false,
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

  async function uploadOne(file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', 'chat');
    form.append('ownerId', DRAFT_OWNER_ID);
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string }>();
      setAttachments((prev) =>
        prev.length >= MAX_FILES ? prev : [...prev, { id: body.id, name: body.name }],
      );
    } catch (err) {
      // 첨부 실패는 조용히 무시(다음 단계에서 토스트). HTTPError 도 동일.
      void (err instanceof HTTPError);
    }
  }

  function addFiles(list: FileList | null): void {
    if (!list) return;
    const remaining = MAX_FILES - attachments.length;
    for (let i = 0; i < Math.min(list.length, remaining); i++) {
      const f = list[i];
      if (!ACCEPTED_MIMES.has(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      void uploadOne(f);
    }
  }

  function autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (sending) return;
    if (body.length === 0 && attachments.length === 0) return;
    setSending(true);
    const result = await sendChatMessageAction({
      conversationId,
      body,
      attachmentIds: attachments.map((a) => a.id),
    });
    setSending(false);
    if (result.ok) {
      // Optimistic append — in no-op (unconfigured) mode onMessage never fires,
      // so this is the only way a sent message shows. The live echo dedups by id.
      const newId = result.messageId;
      setLocalMessages((prev) =>
        prev.some((m) => m.id === newId)
          ? prev
          : [
              ...prev,
              {
                id: newId,
                sender: 'self',
                body,
                rfpId: null,
                createdAt: new Date().toISOString(),
                readByCounterparty: false,
              },
            ],
      );
      setDraft('');
      setAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
    <div className="flex h-full flex-col">
      {/* 헤더 — 상대 워크스페이스 + 타입 + 프레즌스 + 타이핑 */}
      <header className="flex items-center gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
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
      </header>

      {/* 말풍선 목록 */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {localMessages.map((m, i) => {
          const isSelf = m.sender === 'self';
          // Group on the *displayed* day label so the divider key and the
          // rendered label can never diverge across a TZ midnight boundary.
          // Derived from the previous message (no mutable outer var) to stay
          // React-Compiler-pure.
          const dayLabel = formatDayLabel(m.createdAt);
          const prevDayLabel = i > 0 ? formatDayLabel(localMessages[i - 1].createdAt) : null;
          const showDivider = dayLabel !== prevDayLabel;
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
                {!isSelf && (
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
                  <Chip
                    color="surface"
                    icon={<span className="md-numeric">{rfp.code}</span>}
                    label={rfp.title}
                    className="max-w-[78%]"
                  />
                )}

                <div className={cn('flex items-end gap-1.5', isSelf && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'max-w-[78%] whitespace-pre-wrap break-words rounded-[var(--md-sys-shape-medium)] px-3 py-2 text-[13px] leading-relaxed',
                      'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]',
                      isSelf &&
                        'bg-[var(--md-sys-color-surface-container-high)]',
                    )}
                  >
                    {renderBody(m.body)}
                  </div>
                  {isSelf && (
                    <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {formatTime(m.createdAt)}
                    </span>
                  )}
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
          {attachments.map((a) => (
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
          ))}
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
          disabled={sending || (draft.trim().length === 0 && attachments.length === 0)}
          aria-label="보내기"
        >
          <ArrowUpIcon size={16} />
          보내기
        </Button>
      </div>
    </div>
  );
}
