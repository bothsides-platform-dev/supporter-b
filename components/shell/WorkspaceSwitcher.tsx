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
  // Optimistic display of the workspace being switched to. Plain useState (urgent
  // update) — not useTransition (would defer the paint, hurting INP) or
  // useOptimistic (auto-reverts when the action settles, flashing back to the old
  // workspace just before the reload).
  const [pending, setPending] = useState<{ name: string; type: WorkspaceType } | null>(null);

  async function handleSelect(id: string) {
    if (id === current.id || busy) return;
    const target = workspaces.find((w) => w.id === id);
    if (!target) return;
    // Paint the target in the trigger immediately — before the server round-trip
    // and hard reload — so the click feels instant instead of "nothing, then a
    // reload". Stays until the reload on success (no flash); reverted on failure.
    setPending({ name: target.name, type: target.type });
    setBusy(true);
    const r = await switchWorkspaceAction(id);
    if (r.ok) {
      // Hard navigation, not router.push: the active workspace is derived in the
      // shared (app) layout, which a soft navigation preserves (partial
      // rendering) — so the nav chrome would stay on the old workspace. A full
      // document load re-renders the layout with the freshly-written JWT cookie.
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
        className={`flex size-8 min-w-0 items-center justify-center gap-2 rounded-[var(--md-sys-shape-extra-small)] px-2 hover:bg-[var(--md-sys-color-surface-container-high)] outline-none transition-[color,background-color,opacity] duration-[140ms] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0 md:h-9 md:w-full md:justify-start${busy ? ' opacity-60' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate text-[length:var(--md-typescale-label-large-size)] text-[var(--md-sys-color-on-surface)] group-data-[collapsible=icon]:sr-only">
          {display.name}
        </span>
        <Chip
          label={TYPE_LABEL[display.type]}
          color="surface"
          className="h-6 px-2 group-data-[collapsible=icon]:hidden"
        />
        <ChevronsUpDownIcon
          size={14}
          className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
