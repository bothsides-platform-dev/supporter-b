// BoardService — business logic for the unified kanban board (placement +
// column CRUD). Extracted from the board actions so that actions stay thin
// (session + parse + delegate). The Next-auth session boundary stays in the
// actions (board/_shared.ts); this service receives already-resolved
// workspace ids and never imports @/lib/auth/session.
import { randomUUID } from 'node:crypto';

import { isCrossSideLifecycleKey } from '@/lib/server/columns/lifecycle-keys';
import type {
  ColumnRepo,
  InvitationRepo,
  RfpRepo,
} from '@/lib/server/repositories/types';
import {
  isSystemColumn,
  type CardType,
  type ChipColorRole,
  type ColumnKind,
} from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { ServiceResult } from './types';

// The column accent color enum (mirrors the chip_color roles).
export type ColumnColor = ChipColorRole;
export type { CardType, ColumnKind };

// The card-placement actor — the resolved active workspace (id + type). The
// action layer extracts this from the session before delegating.
export type CardActor = { workspaceId: string; workspaceType: WorkspaceType };

export class BoardService {
  constructor(
    private readonly columnRepo: ColumnRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly invitationRepo: InvitationRepo,
  ) {}

  /**
   * Place a card into a CUSTOM column (the only valid drop target). Drops onto
   * system columns are rejected; releasing a card back to auto-classification
   * goes through releaseCard. Lifecycle-column drops that trigger a domain
   * action are handled client-side.
   * Errors: COLUMN_NOT_FOUND | FORBIDDEN | CROSS_KIND | NOT_A_DROP_TARGET.
   */
  async moveCard(
    input: { cardType: CardType; cardId: string; toColumnId: string },
    actor: CardActor,
  ): Promise<ServiceResult> {
    const { cardType, cardId, toColumnId } = input;

    const column = await this.columnRepo.findById(toColumnId);
    if (!column) return { ok: false, error: 'COLUMN_NOT_FOUND' };
    if (column.workspaceId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };
    if (column.kind !== 'pipeline') return { ok: false, error: 'CROSS_KIND' };
    // system (lifecycle-bound) columns ⇒ non-deletable AND non-place-target.
    if (isSystemColumn(column)) return { ok: false, error: 'NOT_A_DROP_TARGET' };

    if (!(await this.cardBelongsToWorkspace(cardType, cardId, actor.workspaceId))) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    await this.setCardBoardColumn(cardType, cardId, toColumnId);
    return { ok: true };
  }

  /**
   * Remove a card's explicit placement so it falls back to auto-classification.
   * No-op if the card has no placement. Errors: FORBIDDEN.
   */
  async releaseCard(
    input: { cardType: CardType; cardId: string },
    actor: CardActor,
  ): Promise<ServiceResult> {
    const { cardType, cardId } = input;

    if (!(await this.cardBelongsToWorkspace(cardType, cardId, actor.workspaceId))) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    await this.setCardBoardColumn(cardType, cardId, null);
    return { ok: true };
  }

  /**
   * Create a custom column on the active workspace board.
   * Errors: COLUMN_NOT_FOUND | FORBIDDEN.
   */
  async addColumn(
    input: { kind: ColumnKind; title: string; color?: ColumnColor | null; position: string },
    actor: CardActor,
  ): Promise<ServiceResult<{ columnId: string }>> {
    const { kind, title, color, position } = input;

    const columnId = randomUUID();
    await this.columnRepo.create({
      id: columnId,
      workspaceId: actor.workspaceId,
      kind,
      title,
      position,
      color: color ?? null,
      lifecycleKey: null, // custom column ⇒ deletable
    });
    return { ok: true, columnId };
  }

  /**
   * Delete a custom column (placements cascade). System columns are
   * non-deletable: cross-side protocol columns return COLUMN_CROSS_SIDE_LOCKED,
   * the rest return COLUMN_SYSTEM_LOCKED.
   * Errors: COLUMN_NOT_FOUND | FORBIDDEN | COLUMN_CROSS_SIDE_LOCKED | COLUMN_SYSTEM_LOCKED.
   */
  async deleteColumn(columnId: string, workspaceId: string): Promise<ServiceResult> {
    const owned = await this.requireOwnedColumn(columnId, workspaceId);
    if (!owned.ok) return owned;

    if (isSystemColumn(owned.column)) {
      return {
        ok: false,
        error: isCrossSideLifecycleKey(owned.column.lifecycleKey)
          ? 'COLUMN_CROSS_SIDE_LOCKED'
          : 'COLUMN_SYSTEM_LOCKED',
      };
    }

    await this.columnRepo.remove(columnId);
    return { ok: true };
  }

  /** Set (or clear, with null) a column's accent color. Errors: COLUMN_NOT_FOUND | FORBIDDEN. */
  async recolorColumn(
    columnId: string,
    color: ColumnColor | null,
    workspaceId: string,
  ): Promise<ServiceResult> {
    const owned = await this.requireOwnedColumn(columnId, workspaceId);
    if (!owned.ok) return owned;
    await this.columnRepo.update(columnId, { color });
    return { ok: true };
  }

  /** Rename a column — allowed on system columns too. Errors: COLUMN_NOT_FOUND | FORBIDDEN. */
  async renameColumn(
    columnId: string,
    title: string,
    workspaceId: string,
  ): Promise<ServiceResult> {
    const owned = await this.requireOwnedColumn(columnId, workspaceId);
    if (!owned.ok) return owned;
    await this.columnRepo.update(columnId, { title });
    return { ok: true };
  }

  /** Move a column to a new position. Allowed on system columns. Errors: COLUMN_NOT_FOUND | FORBIDDEN. */
  async reorderColumn(
    columnId: string,
    position: string,
    workspaceId: string,
  ): Promise<ServiceResult> {
    const owned = await this.requireOwnedColumn(columnId, workspaceId);
    if (!owned.ok) return owned;
    await this.columnRepo.update(columnId, { position });
    return { ok: true };
  }

  // ─── Private helpers (moved from board/_shared.ts) ──────────────────────────

  // Set (or clear, with null) a card's board_column_id via its own card repo.
  private async setCardBoardColumn(
    cardType: CardType,
    cardId: string,
    columnId: string | null,
  ): Promise<void> {
    if (cardType === 'rfp') {
      await this.rfpRepo.setBoardColumn(cardId, columnId);
      return;
    }
    await this.invitationRepo.setBoardColumn(cardId, columnId);
  }

  // Does this card belong to the given workspace's board? rfp boards are owned
  // by the buyer workspace; invitation boards by the pg workspace.
  private async cardBelongsToWorkspace(
    cardType: CardType,
    cardId: string,
    workspaceId: string,
  ): Promise<boolean> {
    if (cardType === 'rfp') {
      const rfp = await this.rfpRepo.findById(cardId);
      return !!rfp && rfp.buyerWsId === workspaceId;
    }
    const inv = await this.invitationRepo.findById(cardId);
    return !!inv && inv.pgWsId === workspaceId;
  }

  // Load a column owned by the given workspace (cross-workspace guard for every
  // column mutation). Used by rename/recolor/reorder/delete.
  private async requireOwnedColumn(
    columnId: string,
    workspaceId: string,
  ): Promise<
    | { ok: true; column: import('@/lib/types/column').BoardColumn }
    | { ok: false; error: string }
  > {
    const column = await this.columnRepo.findById(columnId);
    if (!column) return { ok: false, error: 'COLUMN_NOT_FOUND' };
    if (column.workspaceId !== workspaceId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, column };
  }
}

// ─── Factory (BidService single-global pattern) ──────────────────────────────

declare global {
  var __bidit_board_service__: BoardService | undefined;
}

export async function getBoardService(): Promise<BoardService> {
  if (!globalThis.__bidit_board_service__) {
    const { getColumnRepo, getRfpRepo, getInvitationRepo } = await import(
      '@/lib/server/repositories/factory'
    );
    const [columnRepo, rfpRepo, invitationRepo] = await Promise.all([
      getColumnRepo(),
      getRfpRepo(),
      getInvitationRepo(),
    ]);
    globalThis.__bidit_board_service__ = new BoardService(columnRepo, rfpRepo, invitationRepo);
  }
  return globalThis.__bidit_board_service__!;
}

export function __resetBoardServiceForTest(): void {
  globalThis.__bidit_board_service__ = undefined;
}

export function __setBoardServiceForTest(service: BoardService): void {
  globalThis.__bidit_board_service__ = service;
}
