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
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/primitives/Avatar';
import { IconButton } from '@/components/primitives/IconButton';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Users, Paperclip } from 'lucide-react';
import { ArrowUpIcon, XIcon } from '@/components/icons';
import {
  MAX_FILES,
  MAX_BYTES,
  ACCEPT_EXT,
  ACCEPTED_MIMES,
  ACCEPTED_EXTENSIONS,
} from '@/lib/server/storage/constants';
import { sendTeamMessageAction } from '@/lib/server/actions/chat/sendTeamMessageAction';
import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';
import { useTeamChannel, type TeamLivePayload } from '@/lib/hooks/useTeamChannel';
import { toast } from '@/lib/toast';
import type { Attachment } from '@/lib/types/common';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';
import { MessageAttachmentGrid } from './MessageAttachmentGrid';
import { formatDayLabel, formatTime, withinGroupWindow } from './format';
import { MentionText } from './MentionText';
import { MentionDropdown } from './MentionDropdown';
import {
  detectMentionQuery,
  buildMentionItems,
  applyMentionSelection,
  resolveMentionsToBody,
  type MentionCandidate,
  type MentionItem,
  type MentionQuery,
  type TrackedMention,
} from './mention-input';

type Props = {
  rfpId: string;
  /** Centrifugo 채널 조립용 — loadTeamThread 가 반환한 세션 워크스페이스. */
  workspaceId: string;
  /** 라이브 echo 의 self 판별용 — loadTeamThread 가 반환한 세션 유저 id. */
  viewerUserId: string;
  messages: TeamThreadMessage[];
  teamMembers?: MentionCandidate[];
};

// 하단에서 이만큼(px) 이내면 "하단 근처"로 보고 새 메시지를 자동 추적한다.
const NEAR_BOTTOM_PX = 120;

type LocalMessage = TeamThreadMessage & { pending?: boolean };

// 컴포저 첨부 행. `id` 는 업로드 중에는 임시값(status==='uploading'), 완료되면
// 서버 attachment id 로 교체된다(ThreadView 패턴).
type StagedAttachment = {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  url?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

export function TeamThreadView({ rfpId, workspaceId, viewerUserId, messages, teamMembers = [] }: Props) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(messages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const trackedRef = useRef<TrackedMention[]>([]);
  const caretRef = useRef<number | null>(null);

  // 렌더용 이름 맵 + 동명이인 집합(전체 로스터 기준).
  const nameById = useMemo(
    () => new Map(teamMembers.map((m) => [m.userId, m.name])),
    [teamMembers],
  );
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of teamMembers) seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  }, [teamMembers]);
  // 본인 제외 후보(드롭다운).
  const candidates = useMemo(
    () => teamMembers.filter((m) => m.userId !== viewerUserId),
    [teamMembers, viewerUserId],
  );

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

  // 마운트(및 rfp 전환) 시 팀 스레드를 읽음 처리한다 — ThreadView 의
  // markConversationReadAction 패턴 미러링.
  useEffect(() => {
    void markTeamThreadReadAction({ rfpId });
  }, [rfpId]);

  useEffect(() => {
    if (caretRef.current !== null && textareaRef.current) {
      const pos = caretRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      caretRef.current = null;
    }
  }, [draft]);

  useTeamChannel(rfpId, workspaceId, {
    onMessage: (data: TeamLivePayload) => {
      if (!data.id || typeof data.body !== 'string' || !data.createdAt) return;
      const id = data.id;
      const isSelf = data.authorUserId === viewerUserId;
      setLocalMessages((prev) => {
        // Dedup by id — 재전달·승격 선행 케이스.
        if (prev.some((m) => m.id === id)) return prev;
        // 본인 echo: pending 말풍선을 확정으로 승격(append 하면 중복). 낙관적
        // 첨부는 그대로 보존한다.
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
            attachments: data.attachments ?? [],
          },
        ];
      });
    },
  });

  async function uploadOne(file: File, tempId: string): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', 'team_message');
    // 팀 메시지 첨부의 ownerId 는 RFP id — 전송 시 새 메시지로 재부모된다.
    form.append('ownerId', rfpId);
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string; size: number; mimeType: string }>();
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
    } catch (err) {
      let msg = '업로드 실패';
      if (err instanceof HTTPError) {
        msg =
          err.response.status === 415
            ? '지원되지 않는 파일 형식이에요'
            : `업로드 실패 (${err.response.status})`;
      }
      setAttachments((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, status: 'error', error: msg } : a)),
      );
    }
  }

  function addFiles(list: FileList | null): void {
    if (!list) return;
    const remaining = MAX_FILES - attachments.length;
    const additions: StagedAttachment[] = [];
    for (let i = 0; i < Math.min(list.length, remaining); i++) {
      const f = list[i];
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (!ACCEPTED_MIMES.has(f.type) && !ACCEPTED_EXTENSIONS.has(ext)) {
        const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
        additions.push({
          id: tempId,
          name: f.name,
          status: 'error',
          error: '지원되지 않는 파일 형식이에요 (PDF/PNG/JPEG)',
        });
        continue;
      }
      if (f.size > MAX_BYTES) continue;
      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      additions.push({ id: tempId, name: f.name, size: f.size, status: 'uploading' });
      void uploadOne(f, tempId);
    }
    if (additions.length > 0) setAttachments((prev) => [...prev, ...additions]);
  }

  async function handleSend(): Promise<void> {
    if (sending) return;
    const body = resolveMentionsToBody(draft, trackedRef.current).trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if (body.length === 0 && readyAttachments.length === 0) return;
    setSending(true);

    // 전송 시점의 첨부 스냅샷(reload 불필요) — 낙관적 말풍선 표시용.
    const optimisticAttachments: Attachment[] = readyAttachments.flatMap((a) =>
      a.size !== undefined && a.mimeType && a.url
        ? [{ id: a.id, name: a.name, size: a.size, mimeType: a.mimeType, url: a.url }]
        : [],
    );

    const tempId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    const restoreDraft = draft;
    const restoreAttachments = attachments;
    setLocalMessages((prev) => [
      ...prev,
      {
        id: tempId,
        authorUserId: viewerUserId,
        authorName: '',
        body,
        createdAt: new Date().toISOString(),
        isSelf: true,
        attachments: optimisticAttachments,
        pending: true,
      },
    ]);
    setDraft('');
    trackedRef.current = [];
    setMentionQuery(null);
    setMentionItems([]);
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let result: Awaited<ReturnType<typeof sendTeamMessageAction>>;
    try {
      result = await sendTeamMessageAction({
        rfpId,
        body,
        attachmentIds: readyAttachments.map((a) => a.id),
      });
    } catch {
      result = { ok: false, error: 'NETWORK' };
    }
    setSending(false);
    if (result.ok) {
      const newId = result.messageId;
      const serverCreatedAt = result.createdAt;
      const serverAttachments = result.attachments ?? optimisticAttachments;
      setLocalMessages((prev) => {
        const hasReal = prev.some((m) => m.id === newId);
        return prev.flatMap((m) =>
          m.id === tempId
            ? hasReal
              ? []
              : [
                  {
                    ...m,
                    id: newId,
                    pending: false,
                    createdAt: serverCreatedAt ?? m.createdAt,
                    attachments: serverAttachments,
                  },
                ]
            : [m],
        );
      });
    } else {
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(restoreDraft);
      setAttachments(restoreAttachments);
      toast('메모를 남기지 못했어요. 다시 시도해 주세요.', { type: 'error' });
    }
  }

  function pickMention(item: MentionItem): void {
    if (!mentionQuery) return;
    const pick =
      item.kind === 'all'
        ? ({ kind: 'all' } as const)
        : ({ kind: 'member', userId: item.userId, name: item.name } as const);
    const out = applyMentionSelection(draft, mentionQuery, pick);
    trackedRef.current = [...trackedRef.current, out.tracked];
    caretRef.current = out.caret;
    setDraft(out.text);
    setMentionQuery(null);
    setMentionItems([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (mentionQuery && mentionItems.length > 0) {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setMentionItems([]);
        return;
      }
    }
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
                    <MentionText body={m.body} nameById={nameById} viewerUserId={viewerUserId} />
                    {m.attachments.length > 0 && (
                      <MessageAttachmentGrid attachments={m.attachments} />
                    )}
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
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
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

      {/* 컴포저 — 첨부 + textarea + 보내기 */}
      <div className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-3 py-2">
        <div className="relative flex items-end gap-2">
          {mentionQuery && mentionItems.length > 0 && (
            <MentionDropdown
              items={mentionItems}
              activeIndex={mentionIndex}
              duplicateNames={duplicateNames}
              onPick={pickMention}
              onHover={setMentionIndex}
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
              const q = detectMentionQuery(value, e.target.selectionStart ?? value.length);
              if (q) {
                const items = buildMentionItems(candidates, q.query);
                setMentionQuery(items.length > 0 ? q : null);
                setMentionItems(items);
                setMentionIndex(0);
              } else {
                setMentionQuery(null);
                setMentionItems([]);
              }
            }}
            onKeyDown={handleKeyDown}
            className="min-h-8 max-h-40 flex-1 resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
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
