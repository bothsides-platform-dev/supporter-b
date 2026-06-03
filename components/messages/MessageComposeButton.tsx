'use client';

import { useState } from 'react';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { formatSize } from '@/lib/format';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { ComposeIcon, PaperclipIcon, ChevronDownIcon, XIcon } from '@/components/icons';
import { MAX_FILES, MAX_BYTES, ACCEPT_EXT, ACCEPTED_MIMES } from '@/lib/server/storage/constants';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { listTemplatesAction } from '@/lib/server/actions/chat/listTemplatesAction';
import { saveTemplateAction } from '@/lib/server/actions/chat/saveTemplateAction';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';
import { RecipientCard } from './RecipientCard';
import type { Counterparty, RfpContext } from './types';

type Props = {
  counterparty: Counterparty;
  rfpContext?: RfpContext;
  /**
   * 진입점 표시 형태(인터랙션은 동일 — 클릭 시 '채팅보내기' 메뉴 → 컴포즈 드로어):
   * 'avatar' = 아바타만(헤더·섹션 등), 'profile' = 아바타+상대명(표 행 등 이름 노출 필요).
   */
  variant?: 'avatar' | 'profile';
};

const LABEL = '메시지 보내기';
const PLACEHOLDER = '상대에게 보낼 메시지를 입력하세요';

type AttachmentRow = {
  // tempId until upload resolves, then swapped for the server attachment id.
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

/**
 * 메시지 보내기 진입점 — 프로필(아바타) 클릭 시 '채팅보내기' 메뉴를 열고,
 * 선택하면 우측 리치 작성 드로어(Sheet)를 연다. 드로어에서 저장된 템플릿 불러오기·
 * 템플릿 저장·파일 첨부(최대 5개·20MB)·본문 작성·알림 토글(이메일/인앱)을 다루고
 * '바로 전송' 시 sendChatMessageAction을 호출한다(임베드 RfpContext가 있으면 그
 * RFP uuid를 rfpId 태그로 자동 첨부). 모든 임베드 진입점(RFP 상세·입찰표)이 이
 * 컴포넌트로 통일된다.
 */
export function MessageComposeButton({ counterparty, rfpContext, variant = 'avatar' }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [templates, setTemplates] = useState<ChatMessageTemplate[]>([]);
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [sending, setSending] = useState(false);

  // RfpContext.code carries the RFP *uuid* at all embed sites (e.g.
  // RfpBriefPanel passes `code: rfp.id`); sendChatMessageAction expects a uuid
  // rfpId, so the tag wires straight through.
  const rfpId = rfpContext?.code;

  function resetDraftState() {
    setDraft('');
    setRows([]);
  }

  async function handleOpenChange(open: boolean) {
    setSheetOpen(open);
    if (open) {
      const result = await listTemplatesAction();
      if (result.ok) setTemplates(result.templates);
    } else {
      resetDraftState();
    }
  }

  function insertTemplate(template: ChatMessageTemplate) {
    setDraft((prev) => (prev.trim().length > 0 ? `${prev}\n${template.body}` : template.body));
  }

  async function handleSaveTemplate() {
    const body = draft.trim();
    if (body.length === 0) return;
    const title = body.slice(0, 40);
    await saveTemplateAction({ title, body });
    const result = await listTemplatesAction();
    if (result.ok) setTemplates(result.templates);
  }

  async function uploadOne(file: File, tempId: string) {
    const form = new FormData();
    form.append('file', file);
    // Chat attachments are uploaded as ownerless drafts and linked to the
    // message row by sendChatMessageAction (it validates the rows are unlinked
    // + uploaded by a session-ws member).
    form.append('ownerKind', 'chat');
    form.append('ownerId', '__draft__');
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string; size: number }>();
      setRows((prev) =>
        prev.map((r) =>
          r.id === tempId ? { id: body.id, name: body.name, size: body.size, status: 'ready' } : r,
        ),
      );
    } catch (err) {
      let msg = err instanceof Error ? err.message : '네트워크 오류';
      if (err instanceof HTTPError) {
        const { status } = err.response;
        msg =
          status === 413
            ? '파일이 너무 큽니다 (최대 20MB)'
            : status === 415
              ? '지원되지 않는 파일 형식입니다 (PDF/PNG/JPEG만 허용)'
              : `업로드 실패 (${status})`;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === tempId ? { ...r, status: 'error', error: msg } : r)),
      );
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const remaining = MAX_FILES - rows.length;
    if (remaining <= 0) return;
    const additions: AttachmentRow[] = [];
    for (let i = 0; i < Math.min(fileList.length, remaining); i++) {
      const f = fileList[i];
      if (rows.some((r) => r.name === f.name)) continue;
      if (!ACCEPTED_MIMES.has(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      additions.push({ id: tempId, name: f.name, size: f.size, status: 'uploading' });
      void uploadOne(f, tempId);
    }
    if (additions.length > 0) setRows((prev) => [...prev, ...additions]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSend() {
    if (sending) return;
    const body = draft.trim();
    const attachmentIds = rows.filter((r) => r.status === 'ready').map((r) => r.id);
    if (body.length === 0 && attachmentIds.length === 0) return;
    setSending(true);
    try {
      const result = await sendChatMessageAction({
        counterpartyWorkspaceId: counterparty.workspaceId,
        body,
        rfpId,
        attachmentIds,
      });
      if (result.ok) {
        setSheetOpen(false);
        resetDraftState();
      }
    } finally {
      setSending(false);
    }
  }

  const triggerClass =
    variant === 'profile'
      ? 'group/msg inline-flex items-center gap-2 text-left outline-none rounded-[var(--md-sys-shape-extra-small)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50'
      : 'inline-flex rounded-[var(--md-sys-shape-extra-small)] outline-none transition-shadow hover:ring-2 hover:ring-[var(--md-sys-color-outline-variant)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" aria-label={`${counterparty.name} 프로필`} className={triggerClass} />
          }
        >
          <WorkspaceAvatar
            name={counterparty.name}
            size={variant === 'profile' ? 'sm' : 'md'}
            workspaceId={counterparty.workspaceId}
            hasLogo={counterparty.hasLogo}
          />
          {variant === 'profile' && (
            <span className="font-medium text-[13px] text-[var(--md-sys-color-on-surface)] group-hover/msg:text-[var(--md-sys-color-primary)] group-hover/msg:underline">
              {counterparty.name}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-[140px]">
          <DropdownMenuItem onClick={() => void handleOpenChange(true)}>
            <ComposeIcon size={14} />
            채팅보내기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={sheetOpen} onOpenChange={(o) => void handleOpenChange(o)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{`${counterparty.name}에게 ${LABEL}`}</SheetTitle>
            <SheetDescription>{counterparty.name}에게 메시지를 보냅니다.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
            <RecipientCard counterparty={counterparty} rfpContext={rfpContext} />

            {/* 저장된 템플릿 불러오기 + 저장 */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="저장된 템플릿 불러오기"
                      className="inline-flex items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface)] outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50"
                    />
                  }
                >
                  저장된 템플릿 불러오기
                  <ChevronDownIcon size={13} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[280px] w-[260px] overflow-y-auto">
                  {templates.length === 0 ? (
                    <div className="px-2 py-3 text-center text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                      저장된 템플릿이 없어요.
                    </div>
                  ) : (
                    templates.map((t) => (
                      <DropdownMenuItem key={t.id} onClick={() => insertTemplate(t)}>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] text-[var(--md-sys-color-on-surface)]">
                            {t.title}
                          </span>
                          <span className="truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                            {t.body}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={() => void handleSaveTemplate()}
                disabled={draft.trim().length === 0}
                className="inline-flex items-center rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface)] outline-none transition-colors hover:bg-[var(--md-sys-color-surface-container)] focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 disabled:opacity-50"
              >
                템플릿으로 저장
              </button>
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={6}
              className="w-full resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
            />

            {/* 파일 첨부 */}
            <div className="flex flex-col gap-2">
              <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]">
                <PaperclipIcon size={14} />
                파일 첨부
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_EXT}
                  aria-label="파일 첨부"
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              {rows.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      data-slot="attachment-chip"
                      className="flex items-center gap-2 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-2.5 py-1.5"
                    >
                      <PaperclipIcon size={13} />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-sys-color-on-surface)]">
                        {r.name}
                      </span>
                      <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-outline)]">
                        {formatSize(r.size)}
                      </span>
                      {r.status === 'uploading' && (
                        <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-[var(--md-sys-color-outline)]">
                          UPLOADING…
                        </span>
                      )}
                      {r.status === 'error' && (
                        <span
                          title={r.error}
                          className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-[var(--md-sys-color-error)]"
                        >
                          ERROR
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`${r.name} 제거`}
                        onClick={() => removeRow(r.id)}
                        className="shrink-0 rounded-[var(--md-sys-shape-small)] p-0.5 text-[var(--md-sys-color-outline)] transition-colors hover:text-[var(--md-sys-color-error)]"
                      >
                        <XIcon size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)]">
            <Button variant="ghost" size="sm" onClick={() => void handleOpenChange(false)}>
              취소
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={sending || rows.some((r) => r.status === 'uploading')}
            >
              바로 전송
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
