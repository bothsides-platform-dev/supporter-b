'use client';

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk';
import { Button } from '@/components/primitives/Button';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';

type Props = {
  onBack: () => void;
  onNext: () => void;
};

export function RfpStep3PgSelect({ onBack, onNext }: Props) {
  const draft = useRfpDraftStore();
  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [pgOpen, setPgOpen] = useState(false);
  const [wsInputError, setWsInputError] = useState('');

  const handleWsSelect = (ws: PgWorkspace) => {
    setWsInputError('');
    if (draft.allowedPgWorkspaceIds.some((w) => w.id === ws.id)) {
      setWsInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    draft.setField('allowedPgWorkspaceIds', [...draft.allowedPgWorkspaceIds, ws]);
  };

  const handleWsRemove = (id: string) => {
    draft.setField(
      'allowedPgWorkspaceIds',
      draft.allowedPgWorkspaceIds.filter((w) => w.id !== id),
    );
  };

  return (
    <div className="space-y-4">
      {draft.allowedPgWorkspaceIds.length > 0 && (
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {draft.allowedPgWorkspaceIds.map((ws, i) => (
            <div key={ws.id} className="py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">
                  {ws.displayName}
                </span>
              </div>
              <button
                type="button"
                aria-label="제거"
                onClick={() => handleWsRemove(ws.id)}
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors flex-shrink-0"
              >
                제거
              </button>
            </div>
          ))}
        </div>
      )}

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
            className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-left text-[14px] text-[var(--md-sys-color-outline)] hover:border-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
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
            <Command>
              <CommandInput
                placeholder="PG사 이름 검색"
                className="w-full bg-transparent px-3 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none border-b border-[var(--md-sys-color-outline-variant)]"
              />
              <CommandList className="max-h-[200px] overflow-y-auto">
                <CommandEmpty className="py-2 px-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                  {pgLoading ? 'LOADING…' : pgError ?? '결과 없음'}
                </CommandEmpty>
                {pgList.map((pg) => {
                  const alreadyAdded = draft.allowedPgWorkspaceIds.some((w) => w.id === pg.id);
                  return (
                    <CommandItem
                      key={pg.id}
                      value={pg.displayName}
                      disabled={alreadyAdded}
                      onSelect={() => {
                        handleWsSelect(pg);
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

      {wsInputError && (
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
          {wsInputError}
        </p>
      )}

      <div className="flex justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button type="button" variant="outlined" size="md" onClick={onBack}>
          이전
        </Button>
        <Button type="button" size="md" onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
