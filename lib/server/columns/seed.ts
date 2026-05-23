// Canonical default column set for a workspace — the SINGLE source of truth.
// Called by createWorkspaceInTx (new workspaces) and the backfill script
// (existing workspaces). Pure: given a workspace id + type, returns the columns
// to insert. No DB import.
import { randomUUID } from 'node:crypto';
import { generateNKeysBetween } from 'fractional-indexing';
import type { BoardColumn, ColumnKind } from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import { BUYER_KANBAN_ORDER, BUYER_KANBAN_LABEL } from '@/lib/server/buyer-kanban';
import { PG_KANBAN_ORDER, PG_KANBAN_LABEL } from '@/lib/server/pg-kanban';
import { DEFAULT_LANDING_KEY } from './lifecycle-keys';

type ColumnSpec = {
  kind: ColumnKind;
  title: string;
  lifecycleKey: string | null;
  isSystem: boolean;
};

function buyerSpecs(): ColumnSpec[] {
  const pipeline: ColumnSpec[] = BUYER_KANBAN_ORDER.map((key) => ({
    kind: 'pipeline',
    title: BUYER_KANBAN_LABEL[key],
    lifecycleKey: key,
    isSystem: true,
  }));
  const rfpBids: ColumnSpec[] = [
    // 진행전 = default landing for unplaced bids (non-deletable, not cross-side).
    { kind: 'rfp_bids', title: '진행전', lifecycleKey: DEFAULT_LANDING_KEY, isSystem: true },
    { kind: 'rfp_bids', title: '협상중', lifecycleKey: null, isSystem: false },
    { kind: 'rfp_bids', title: '결정', lifecycleKey: null, isSystem: false },
  ];
  return [...pipeline, ...rfpBids];
}

function pgSpecs(): ColumnSpec[] {
  return PG_KANBAN_ORDER.map((key) => ({
    kind: 'pipeline',
    title: PG_KANBAN_LABEL[key],
    lifecycleKey: key,
    isSystem: true,
  }));
}

export function defaultColumns(
  workspaceId: string,
  type: WorkspaceType,
): BoardColumn[] {
  const specs = type === 'buyer' ? buyerSpecs() : pgSpecs();

  // position is per-(kind) — compute fractional keys per kind group so each
  // board's columns are independently ordered starting from the left.
  const byKind = new Map<ColumnKind, ColumnSpec[]>();
  for (const s of specs) {
    const list = byKind.get(s.kind) ?? [];
    list.push(s);
    byKind.set(s.kind, list);
  }

  const out: BoardColumn[] = [];
  for (const [kind, list] of byKind) {
    const positions = generateNKeysBetween(null, null, list.length);
    list.forEach((s, i) => {
      out.push({
        id: randomUUID(),
        workspaceId,
        kind,
        title: s.title,
        position: positions[i],
        color: null,
        lifecycleKey: s.lifecycleKey,
        isSystem: s.isSystem,
      });
    });
  }
  return out;
}
