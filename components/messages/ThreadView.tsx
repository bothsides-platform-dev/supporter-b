'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { PaperclipIcon, ArrowUpIcon, CheckIcon, XIcon } from '@/components/icons';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/constants';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { COUNTERPARTY_TYPE_LABEL, type ThreadMessage } from './types';

type Props = {
  conversationId: string;
  counterparty: { workspaceId: string; name: string; type: 'buyer' | 'pg' };
  messages: ThreadMessage[];
  /** 상대가 마지막 보낸 메시지까지 읽었는지 — 마지막 self 메시지 하단에 "읽음". */
  readByCounterparty?: boolean;
  /** 상대 프레즌스(온라인 점) — 라이브 배선은 후속. */
  online?: boolean;
  /** 상대 타이핑 인디케이터("입력 중…") — 라이브 배선은 후속. */
  typing?: boolean;
  /** rfpId(uuid) → 표시용 코드/제목. 주어진 항목만 RFP 칩을 렌더(uuid 원문 노출 금지). */
  rfpById?: Record<string, { code: string; title: string }>;
};

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT_EXT = '.pdf,.png,.jpg,.jpeg';
const ACCEPTED_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

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
  readByCounterparty = false,
  online = false,
  typing = false,
  rfpById,
}: Props) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 마지막 self 메시지 인덱스 — 읽음 영수증은 여기에만 붙인다.
  const lastSelfIndex = messages.reduce(
    (acc, m, i) => (m.sender === 'self' ? i : acc),
    -1,
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
      setDraft('');
      setAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }

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
          {typing && (
            <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">입력 중…</span>
          )}
        </div>
      </header>

      {/* 말풍선 목록 */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => {
          const isSelf = m.sender === 'self';
          // Group on the *displayed* day label so the divider key and the
          // rendered label can never diverge across a TZ midnight boundary.
          // Derived from the previous message (no mutable outer var) to stay
          // React-Compiler-pure.
          const dayLabel = formatDayLabel(m.createdAt);
          const prevDayLabel = i > 0 ? formatDayLabel(messages[i - 1].createdAt) : null;
          const showDivider = dayLabel !== prevDayLabel;
          const rfp = m.rfpId ? rfpById?.[m.rfpId] : undefined;
          const showReceipt = isSelf && i === lastSelfIndex && readByCounterparty;

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
