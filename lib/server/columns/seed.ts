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
// lifecycleKey non-null ⇒ system (non-deletable); null ⇒ custom. No isSystem flag.
type ColumnSpec = {
  kind: ColumnKind;
  title: string;
  lifecycleKey: string | null;
};

function buyerSpecs(): ColumnSpec[] {
  return BUYER_KANBAN_ORDER.map((key) => ({
    kind: 'pipeline' as const,
    title: BUYER_KANBAN_LABEL[key],
    lifecycleKey: key,
  }));
}

function pgSpecs(): ColumnSpec[] {
  return PG_KANBAN_ORDER.map((key) => ({
    kind: 'pipeline',
    title: PG_KANBAN_LABEL[key],
    lifecycleKey: key,
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
      });
    });
  }
  return out;
}
