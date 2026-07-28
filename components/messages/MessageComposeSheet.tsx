'use client';

import { useEffect, useState } from 'react';
import { HTTPError } from 'ky';
import { formatSize } from '@/lib/utils/format';
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
import { PaperclipIcon, ChevronDownIcon, XIcon } from '@/components/icons';
import { ACCEPT_EXT } from '@/lib/server/storage/constants';
import { useComposerAttachments } from './useComposerAttachments';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { listTemplatesAction } from '@/lib/server/actions/chat/listTemplatesAction';
import { saveTemplateAction } from '@/lib/server/actions/chat/saveTemplateAction';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';
import { RecipientCard } from './RecipientCard';
import type { Counterparty, RfpContext } from './types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterparty: Counterparty;
  rfpContext?: RfpContext;
};

const LABEL = '메시지 보내기';
const PLACEHOLDER = '상대에게 보낼 메시지를 입력하세요';

/**
 * 받는사람이 정해진 리치 작성 드로어(controlled) — 저장된 템플릿 불러오기·템플릿 저장·
 * 파일 첨부(최대 5개·20MB)·본문 작성·전송을 다룬다. '바로 전송' 시 sendChatMessageAction을
 * 호출하고(임베드 RfpContext가 있으면 그 RFP uuid를 rfpId 태그로 자동 첨부), 성공하면
 * onOpenChange(false)로 닫는다. 진입점(프로필 카드 등)이 open/onOpenChange로 제어한다.
 */
export function MessageComposeSheet({ open, onOpenChange, counterparty, rfpContext }: Props) {
  const [draft, setDraft] = useState('');
  const [templates, setTemplates] = useState<ChatMessageTemplate[]>([]);
  const { rows, addFiles, removeRow, clear } = useComposerAttachments({
    ownerKind: 'chat',
    ownerId: '__draft__',
    dedupeByName: true,
    mapUploadError: (err) => {
      if (err instanceof HTTPError) {
        const { status } = err.response;
        return status === 413
          ? '파일이 너무 큽니다 (최대 20MB)'
          : status === 415
            ? '지원되지 않는 파일 형식입니다 (PDF/PNG/JPEG만 허용)'
            : `업로드 실패 (${status})`;
      }
      return err instanceof Error ? err.message : '네트워크 오류';
    },
  });
  const [sending, setSending] = useState(false);

  const rfpId = rfpContext?.id;

  function resetDraftState() {
    setDraft('');
    clear();
  }

  // Reset on close happens in the close handler (an event), not the effect, so
  // we never call setState synchronously inside the effect body.
  function handleOpenChange(next: boolean) {
    if (!next) resetDraftState();
    onOpenChange(next);
  }

  // Load saved templates when the drawer opens (async — no synchronous setState).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const result = await listTemplatesAction();
      if (!cancelled && result.ok) setTemplates(result.templates);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        handleOpenChange(false);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
                className="hidden"
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
                    <span className="md-numeric shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {formatSize(r.size ?? 0)}
                    </span>
                    {r.status === 'uploading' && (
                      <span className="shrink-0 md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                        UPLOADING…
                      </span>
                    )}
                    {r.status === 'error' && (
                      <span
                        title={r.error}
                        className="shrink-0 md-label-small text-[var(--md-sys-color-error)]"
                      >
                        ERROR
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`${r.name} 제거`}
                      onClick={() => removeRow(r.id)}
                      className="shrink-0 rounded-[var(--md-sys-shape-small)] p-0.5 text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:text-[var(--md-sys-color-error)]"
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
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
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
  );
}
