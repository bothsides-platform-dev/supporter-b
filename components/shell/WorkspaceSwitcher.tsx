// components/shell/WorkspaceSwitcher.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDownIcon, CheckIcon, PlusIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Chip } from '@/components/primitives/Chip';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { switchWorkspaceAction } from '@/lib/server/actions/workspace/switchWorkspaceAction';
import type {
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';

const TYPE_LABEL: Record<WorkspaceType, string> = { buyer: '구매사', pg: 'PG' };

type Props = {
  current: { id: string; name: string; type: WorkspaceType };
  workspaces: WorkspaceMembershipSummary[];
};

export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; type: WorkspaceType } | null>(null);

  async function handleSelect(id: string) {
    if (id === current.id || busy) return;
    const target = workspaces.find((w) => w.id === id);
    if (!target) return;
    setPending({ name: target.name, type: target.type });
    setBusy(true);
    const r = await switchWorkspaceAction(id);
    if (r.ok) {
      window.location.assign(r.redirectTo);
    } else {
      setPending(null);
      setBusy(false);
    }
  }

  const display = pending ?? current;

  const itemCls =
    'flex items-center gap-2 px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] cursor-pointer text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        aria-busy={busy}
        className={`flex h-9 w-full min-w-0 flex-nowrap items-center justify-start gap-2 rounded-[var(--md-sys-shape-extra-small)] px-2 hover:bg-[var(--md-sys-color-surface-container-high)] outline-none transition-[color,background-color,opacity] duration-[140ms] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0${busy ? ' opacity-60' : ''}`}
      >
        {/* 접힘/펼침 모두 표시. 접힘 시 이 아이콘만 남음 */}
        <WorkspaceAvatar name={display.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:sr-only">
          {display.name}
        </span>
        <Chip
          label={TYPE_LABEL[display.type]}
          color="surface"
          className="h-6 shrink-0 whitespace-nowrap px-2 group-data-[collapsible=icon]:hidden"
        />
        {/* 접힘 상태에서는 chevron 숨김 — 아바타만 남아 아이콘 역할 */}
        <ChevronsUpDownIcon
          size={14}
          className="shrink-0 text-[var(--md-sys-color-on-surface-variant)] group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[var(--shell-sidebar)] min-w-[var(--shell-sidebar)] rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-1 shadow-[var(--md-sys-elevation-2)]"
      >
        <div className="px-2 py-1.5 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
          내 워크스페이스
        </div>
        {workspaces.map((ws) => {
          const active = ws.id === current.id;
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSelect(ws.id)}
              className={itemCls}
            >
              <span className="w-4 shrink-0 text-[var(--md-sys-color-primary)]">
                {active && <CheckIcon size={14} />}
              </span>
              <WorkspaceAvatar name={ws.name} size="sm" />
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.unreadCount > 0 && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--md-sys-color-error)]" />
              )}
              <span className="shrink-0 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
                {TYPE_LABEL[ws.type]}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-[var(--md-sys-color-outline-variant)]" />
        <DropdownMenuItem onClick={() => router.push('/workspace/new')} className={itemCls}>
          <PlusIcon size={14} className="shrink-0" />
          워크스페이스 만들기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
