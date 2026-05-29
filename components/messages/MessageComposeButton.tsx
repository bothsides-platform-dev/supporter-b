'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/primitives/IconButton';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { ComposeIcon, PaperclipIcon } from '@/components/icons';
import { ComingSoonDialog } from './ComingSoonDialog';
import { RecipientCard } from './RecipientCard';
import type { Counterparty, RfpContext } from './types';

type Props = {
  counterparty: Counterparty;
  rfpContext?: RfpContext;
  /**
   * 'button' = 텍스트 버튼(프로필 섹션), 'icon' = 아이콘 버튼(모달 헤더 등),
   * 'profile' = 아바타+상대명 인라인 프로필(표 행 등 — 클릭 시 채팅).
   */
  variant?: 'button' | 'icon' | 'profile';
};

const LABEL = '메시지 보내기';

/**
 * 사업자 프로필 진입점 — 클릭 시 우측 컴포즈 Sheet를 연다.
 * Sheet 안의 '채팅보내기'는 백엔드 미구현이라 '구현중' 모달로 귀결(렌더 전용).
 */
export function MessageComposeButton({ counterparty, rfpContext, variant = 'button' }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [draft, setDraft] = useState('');

  function handleSend() {
    // 백엔드 미구현 — 전송 대신 '구현중' 모달.
    setComingSoonOpen(true);
  }

  return (
    <>
      {variant === 'profile' ? (
        <button
          type="button"
          aria-label={`${counterparty.name} ${LABEL}`}
          onClick={() => setSheetOpen(true)}
          className="group/msg inline-flex items-center gap-2 text-left"
        >
          <WorkspaceAvatar
            name={counterparty.name}
            size="sm"
            workspaceId={counterparty.workspaceId}
            hasLogo={counterparty.hasLogo}
          />
          <span className="font-medium text-[13px] text-[var(--md-sys-color-on-surface)] group-hover/msg:text-[var(--md-sys-color-primary)] group-hover/msg:underline">
            {counterparty.name}
          </span>
        </button>
      ) : variant === 'icon' ? (
        <IconButton label={LABEL} size="sm" onClick={() => setSheetOpen(true)}>
          <ComposeIcon size={18} />
        </IconButton>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
          <ComposeIcon size={14} />
          {LABEL}
        </Button>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{LABEL}</SheetTitle>
            <SheetDescription>{counterparty.name}에게 메시지를 보냅니다.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
            <RecipientCard counterparty={counterparty} rfpContext={rfpContext} />

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="메시지를 입력하세요…"
              rows={6}
              className="w-full resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
            />

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex w-fit items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 py-1.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)] opacity-60"
            >
              <PaperclipIcon size={14} />
              파일 첨부
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-4">
            <Button variant="ghost" size="sm" onClick={() => setSheetOpen(false)}>
              취소
            </Button>
            <Button size="sm" onClick={handleSend}>
              채팅보내기
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ComingSoonDialog open={comingSoonOpen} onOpenChange={setComingSoonOpen} />
    </>
  );
}
