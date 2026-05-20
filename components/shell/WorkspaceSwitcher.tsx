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

// Topbar workspace switcher. Lists every workspace the user belongs to (active
// one checked); selecting another re-derives type/role server-side and swaps the
// nav tree by switching the active workspace then landing on /home.
export function WorkspaceSwitcher({ current, workspaces }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSelect(id: string) {
    if (id === current.id || busy) return;
    setBusy(true);
    const r = await switchWorkspaceAction(id);
    if (r.ok) {
      router.refresh();
      router.push(r.redirectTo);
    } else {
      setBusy(false);
    }
  }

  const itemCls =
    'flex items-center gap-2 px-2 py-1.5 rounded-[var(--md-sys-shape-extra-small)] cursor-pointer text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-2 max-w-[260px] rounded-[var(--md-sys-shape-extra-small)] hover:bg-[var(--md-sys-color-surface-container-high)] outline-none transition-colors duration-[140ms]">
        <span className="truncate text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)]">
          {current.name}
        </span>
        <Chip label={TYPE_LABEL[current.type]} color="surface" className="h-6 px-2" />
        <ChevronsUpDownIcon
          size={14}
          className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="min-w-[240px] rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] p-1 shadow-[var(--md-sys-elevation-2)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[length:var(--md-typescale-label-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
          내 워크스페이스
        </DropdownMenuLabel>
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
              <span className="flex-1 truncate">{ws.name}</span>
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
        <DropdownMenuItem onClick={() => router.push('/workspace/join')} className={itemCls}>
          <span className="w-4 shrink-0 text-center text-[var(--md-sys-color-on-surface-variant)]">
            →
          </span>
          초대 링크로 합류
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
