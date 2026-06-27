'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk';
import { getChoseong } from 'es-hangul';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Chip } from '@/components/primitives/Chip';
import type { ChipColor } from '@/components/primitives/Chip';
import { CounterpartyProfileCard } from '@/components/messages/CounterpartyProfileCard';
import {
  addPgWorkspacesToRfpAction,
  sendDraftInvitationsAction,
} from '@/lib/server/actions/rfp';
import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';
import { toast } from '@/lib/toast';
import { Divider } from '@/components/ui/Divider';
import type { InvitationStatus } from '@/lib/types/invitation';

/**
 * cmdk의 filter prop에 사용하는 한국어 초성 검색 필터.
 * 부분 문자열(대소문자 무관) 또는 초성 연속 중 하나가 일치하면 1, 모두 불일치면 0을 반환한다.
 * cmdk v1 spec: 0 = hidden, 양수 = visible.
 */
export function chosungCommandFilter(value: string, search: string): number {
  if (search === '') return 1;
  if (value.toLowerCase().includes(search.toLowerCase())) return 1;
  if (getChoseong(value).includes(search)) return 1;
  return 0;
}

type InvitationView = {
  wsId: string;
  wsName: string;
  status: InvitationStatus;
};

type Props = {
  rfpId: string;
  invitations: InvitationView[];
  canEdit: boolean;
};

const statusLabel: Record<InvitationStatus, string> = {
  draft: '대기중',
  sent: '초대 보냄',
  opened: '열람',
  accepted: '수락',
  declined: '거절',
  expired: '만료',
};

const statusColor: Record<InvitationStatus, ChipColor> = {
  draft: 'surface',
  sent: 'surface',
  opened: 'warning',
  accepted: 'tertiary',
  declined: 'error',
  expired: 'surface',
};

export function RfpInviteManager({
  rfpId,
  invitations,
  canEdit,
}: Props) {
  const router = useRouter();
  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [pgOpen, setPgOpen] = useState(false);
  const [inputError, setInputError] = useState('');
  const [pending, startTransition] = useTransition();

  const draftCount = invitations.filter((i) => i.status === 'draft').length;

  const handleSelect = (ws: PgWorkspace) => {
    setInputError('');
    if (invitations.some((i) => i.wsId === ws.id)) {
      setInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    startTransition(async () => {
      const r = await addPgWorkspacesToRfpAction({ rfpId, workspaceIds: [ws.id] });
      if (!r.ok) {
        toast(`추가하지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      router.refresh();
    });
  };

  const handleSendDrafts = () => {
    if (draftCount === 0) return;
    startTransition(async () => {
      const r = await sendDraftInvitationsAction({ rfpId });
      if (!r.ok) {
        toast(`초대 메일을 보내지 못했어요 — ${r.error}`, { type: 'error' });
        return;
      }
      toast(`${r.sentCount}개 PG에 초대 메일을 보냈어요.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* PG 목록 */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>초대 PG</Label>
          <Divider />
        </div>
        {invitations.length === 0 ? (
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            초대한 PG가 없어요.
          </p>
        ) : (
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {invitations.map((inv, i) => (
              <div
                key={inv.wsId}
                className="py-2 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <CounterpartyProfileCard
                    variant="profile"
                    counterparty={{ name: inv.wsName, type: 'pg', workspaceId: inv.wsId }}
                  />
                </div>
                <Chip label={statusLabel[inv.status]} color={statusColor[inv.status]} />
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <>
          {/* PG 검색 추가 */}
          <div className="space-y-2">
            <Label size="md" muted={false}>PG 워크스페이스 추가</Label>
            <Popover.Root
              open={pgOpen}
              onOpenChange={(v) => {
                setPgOpen(v);
                if (v) loadPg();
              }}
            >
              <Popover.Trigger asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-left text-[14px] text-[var(--md-sys-color-outline)] hover:border-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors disabled:opacity-50"
                >
                  PG사 검색…
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  sideOffset={4}
                  className="z-50 w-[var(--radix-popover-trigger-width)] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-md shadow-sm overflow-hidden"
                >
                  <Command filter={chosungCommandFilter}>
                    <CommandInput
                      placeholder="PG사 이름 검색"
                      className="w-full bg-transparent px-3 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none border-b border-[var(--md-sys-color-outline-variant)]"
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 px-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                        {pgLoading ? 'LOADING…' : pgError ?? '결과 없음'}
                      </CommandEmpty>
                      {pgList.map((pg) => {
                        const alreadyAdded = invitations.some((i) => i.wsId === pg.id);
                        return (
                          <CommandItem
                            key={pg.id}
                            value={pg.displayName}
                            disabled={alreadyAdded}
                            onSelect={() => {
                              handleSelect(pg);
                              setPgOpen(false);
                            }}
                            className="px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] data-[selected=true]:bg-[var(--md-sys-color-surface-container-high)] aria-disabled:opacity-40 cursor-pointer"
                          >
                            {pg.displayName}
                          </CommandItem>
                        );
                      })}
                    </CommandList>
                  </Command>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {inputError && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {inputError}
              </p>
            )}
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
              추가된 PG는 [ 대기중 ] 상태로 쌓여요. 아래 &ldquo;초대 보내기&rdquo;를
              누르면 메일이 나가요.
            </p>
          </div>

          {/* 초대 보내기 */}
          <div className="space-y-2">
            <Button
              type="button"
              fullWidth
              size="md"
              variant={draftCount > 0 ? 'filled' : 'text'}
              disabled={draftCount === 0 || pending}
              onClick={handleSendDrafts}
            >
              {pending && draftCount > 0
                ? '보내는 중…'
                : draftCount > 0
                  ? `${draftCount}개 PG에 초대 보내기`
                  : '보낼 대기 PG 없음'}
            </Button>
          </div>

        </>
      )}
    </div>
  );
}
