'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { DealRoomChat } from '../DealRoomChat';
import type { DealRoomCounterparty } from '../DealRoomContext';

export function PgChatPanel({
  workspaceId,
  rfpId,
  rfpCode,
  rfpTitle,
  buyer,
  closedCounterpartyIds,
}: {
  workspaceId: string;
  rfpId: string;
  rfpCode: string;
  rfpTitle: string;
  buyer: DealRoomCounterparty;
  closedCounterpartyIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { data: unread, mutate } = useSWR(
    ['pg-request-chat-unread', workspaceId, rfpId, buyer.workspaceId],
    async () =>
      (await listInboxForViewer()).some(
        (item) =>
          item.unread &&
          (item.kind === 'team'
            ? item.rfpId === rfpId
            : item.counterparty.workspaceId === buyer.workspaceId),
      ),
    { refreshInterval: 30_000 },
  );
  return (
    <>
      <Button
        ref={trigger}
        variant="outlined"
        icon={<MessageSquare />}
        onClick={() => setOpen(true)}
      >
        구매사에게 질문하기{' '}
        {unread && (
          <span className="text-[var(--md-sys-color-primary)]">안 읽음</span>
        )}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) void mutate();
        }}
      >
        <SheetContent
          side="right"
          size="md"
          finalFocus={trigger}
          className="gap-0 p-0 data-[side=right]:w-full"
        >
          <div className="shrink-0 px-4 py-4 pr-12">
            <SheetTitle>구매사에게 질문하기</SheetTitle>
            <SheetDescription>
              추가 확인이 필요한 조건은 구매사에게 물어봐요. 팀 채팅은 우리
              회사만 볼 수 있어요.
            </SheetDescription>
          </div>
          <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
            <DealRoomChat
              rfpId={rfpId}
              rfpCode={rfpCode}
              rfpTitle={rfpTitle}
              fixedCounterparty={buyer}
              closedCounterpartyIds={closedCounterpartyIds}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
