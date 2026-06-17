// BoardService — unit tests against in-memory FAKE repos (no DB). Covers the
// logic moved out of the board actions: cross-kind guard, system-column
// not-a-drop-target, cross-workspace ownership, system/cross-side delete locks,
// and the placement write paths (rfp / invitation → setBoardColumn).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  BoardService,
  __resetBoardServiceForTest,
  __setBoardServiceForTest,
  getBoardService,
  type CardActor,
} from '../board';
import type { BoardColumn } from '@/lib/types/column';
import type {
  ColumnRepo,
  InvitationRepo,
  RfpRepo,
} from '@/lib/server/repositories/types';

// ─── fake repos (only the methods BoardService touches) ──────────────────────

class FakeColumnRepo {
  private byId = new Map<string, BoardColumn>();
  removed: string[] = [];
  updated: { id: string; patch: Partial<BoardColumn> }[] = [];
  created: BoardColumn[] = [];

  seed(col: BoardColumn) {
    this.byId.set(col.id, col);
    return col;
  }
  async findById(id: string) {
    return this.byId.get(id);
  }
  async create(col: BoardColumn) {
    this.created.push(col);
    this.byId.set(col.id, col);
  }
  async update(id: string, patch: Partial<BoardColumn>) {
    this.updated.push({ id, patch });
    const cur = this.byId.get(id);
    if (cur) this.byId.set(id, { ...cur, ...patch });
  }
  async remove(id: string) {
    this.removed.push(id);
    this.byId.delete(id);
  }
}

class FakeRfpRepo {
  private byId = new Map<string, { id: string; buyerWsId: string }>();
  placements: { rfpId: string; columnId: string | null }[] = [];
  seed(r: { id: string; buyerWsId: string }) {
    this.byId.set(r.id, r);
    return r;
  }
  async findById(id: string) {
    return this.byId.get(id);
  }
  async setBoardColumn(rfpId: string, columnId: string | null) {
    this.placements.push({ rfpId, columnId });
  }
}

class FakeInvitationRepo {
  private byId = new Map<string, { id: string; pgWsId: string }>();
  placements: { invId: string; columnId: string | null }[] = [];
  seed(i: { id: string; pgWsId: string }) {
    this.byId.set(i.id, i);
    return i;
  }
  async findById(id: string) {
    return this.byId.get(id);
  }
  async setBoardColumn(invId: string, columnId: string | null) {
    this.placements.push({ invId, columnId });
  }
}

function makeColumn(over: Partial<BoardColumn> = {}): BoardColumn {
  return {
    id: randomUUID(),
    workspaceId: 'ws-buyer',
    kind: 'pipeline',
    title: '협상중',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    ...over,
  };
}

const BUYER: CardActor = { workspaceId: 'ws-buyer', workspaceType: 'buyer' };
const PG: CardActor = { workspaceId: 'ws-pg', workspaceType: 'pg' };

function build() {
  const columnRepo = new FakeColumnRepo();
  const rfpRepo = new FakeRfpRepo();
  const invRepo = new FakeInvitationRepo();
  const service = new BoardService(
    columnRepo as unknown as ColumnRepo,
    rfpRepo as unknown as RfpRepo,
    invRepo as unknown as InvitationRepo,
  );
  return { service, columnRepo, rfpRepo, invRepo };
}

describe('BoardService.moveCard', () => {
  it('COLUMN_NOT_FOUND when the target column does not exist', async () => {
    const { service } = build();
    const r = await service.moveCard(
      { cardType: 'rfp', cardId: randomUUID(), toColumnId: randomUUID() },
      BUYER,
    );
    expect(r).toEqual({ ok: false, error: 'COLUMN_NOT_FOUND' });
  });

  it('FORBIDDEN when the column belongs to another workspace', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ workspaceId: 'ws-other' }));
    const r = await service.moveCard(
      { cardType: 'rfp', cardId: randomUUID(), toColumnId: col.id },
      BUYER,
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('NOT_A_DROP_TARGET when the target is a system (lifecycle) column', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ lifecycleKey: 'inbox' }));
    const r = await service.moveCard(
      { cardType: 'rfp', cardId: randomUUID(), toColumnId: col.id },
      BUYER,
    );
    expect(r).toEqual({ ok: false, error: 'NOT_A_DROP_TARGET' });
  });

  it('FORBIDDEN when the rfp card belongs to another workspace', async () => {
    const { service, columnRepo, rfpRepo } = build();
    const col = columnRepo.seed(makeColumn());
    const rfp = rfpRepo.seed({ id: randomUUID(), buyerWsId: 'ws-other' });
    const r = await service.moveCard(
      { cardType: 'rfp', cardId: rfp.id, toColumnId: col.id },
      BUYER,
    );
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('places an rfp card via rfp.setBoardColumn', async () => {
    const { service, columnRepo, rfpRepo } = build();
    const col = columnRepo.seed(makeColumn({ kind: 'pipeline' }));
    const rfp = rfpRepo.seed({ id: randomUUID(), buyerWsId: 'ws-buyer' });
    const r = await service.moveCard(
      { cardType: 'rfp', cardId: rfp.id, toColumnId: col.id },
      BUYER,
    );
    expect(r.ok).toBe(true);
    expect(rfpRepo.placements).toEqual([{ rfpId: rfp.id, columnId: col.id }]);
  });

  it('places an invitation card via invitation.setBoardColumn (pg board)', async () => {
    const { service, columnRepo, invRepo } = build();
    const col = columnRepo.seed(makeColumn({ kind: 'pipeline', workspaceId: 'ws-pg' }));
    const inv = invRepo.seed({ id: randomUUID(), pgWsId: 'ws-pg' });
    const r = await service.moveCard(
      { cardType: 'invitation', cardId: inv.id, toColumnId: col.id },
      PG,
    );
    expect(r.ok).toBe(true);
    expect(invRepo.placements).toEqual([{ invId: inv.id, columnId: col.id }]);
  });
});

describe('BoardService.releaseCard', () => {
  it('FORBIDDEN when the card belongs to another workspace', async () => {
    const { service, rfpRepo } = build();
    const rfp = rfpRepo.seed({ id: randomUUID(), buyerWsId: 'ws-other' });
    const r = await service.releaseCard({ cardType: 'rfp', cardId: rfp.id }, BUYER);
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('clears the placement (setBoardColumn null) for an owned rfp card', async () => {
    const { service, rfpRepo } = build();
    const rfp = rfpRepo.seed({ id: randomUUID(), buyerWsId: 'ws-buyer' });
    const r = await service.releaseCard({ cardType: 'rfp', cardId: rfp.id }, BUYER);
    expect(r.ok).toBe(true);
    expect(rfpRepo.placements).toEqual([{ rfpId: rfp.id, columnId: null }]);
  });
});

describe('BoardService.addColumn', () => {
  it('creates a custom column (lifecycleKey null) and returns its id', async () => {
    const { service, columnRepo } = build();
    const r = await service.addColumn(
      { kind: 'pipeline', title: '보류', color: 'warning', position: 'z1' },
      BUYER,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(columnRepo.created).toHaveLength(1);
      expect(columnRepo.created[0]).toMatchObject({
        id: r.columnId,
        workspaceId: 'ws-buyer',
        kind: 'pipeline',
        title: '보류',
        color: 'warning',
        lifecycleKey: null,
      });
    }
  });

  it('defaults color to null when omitted', async () => {
    const { service, columnRepo } = build();
    const r = await service.addColumn({ kind: 'pipeline', title: 'x', position: 'a1' }, BUYER);
    expect(r.ok).toBe(true);
    expect(columnRepo.created[0].color).toBeNull();
  });
});

describe('BoardService.deleteColumn', () => {
  it('COLUMN_NOT_FOUND for a missing column', async () => {
    const { service } = build();
    const r = await service.deleteColumn(randomUUID(), 'ws-buyer');
    expect(r).toEqual({ ok: false, error: 'COLUMN_NOT_FOUND' });
  });

  it('FORBIDDEN for a column owned by another workspace', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ workspaceId: 'ws-other' }));
    const r = await service.deleteColumn(col.id, 'ws-buyer');
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('COLUMN_CROSS_SIDE_LOCKED for a cross-side lifecycle column', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ lifecycleKey: 'active' })); // cross-side
    const r = await service.deleteColumn(col.id, 'ws-buyer');
    expect(r).toEqual({ ok: false, error: 'COLUMN_CROSS_SIDE_LOCKED' });
  });

  it('COLUMN_SYSTEM_LOCKED for a system column', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ lifecycleKey: 'inbox' })); // system, not cross-side
    const r = await service.deleteColumn(col.id, 'ws-buyer');
    expect(r).toEqual({ ok: false, error: 'COLUMN_SYSTEM_LOCKED' });
  });

  it('deletes a custom (deletable) column', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ lifecycleKey: null }));
    const r = await service.deleteColumn(col.id, 'ws-buyer');
    expect(r.ok).toBe(true);
    expect(columnRepo.removed).toEqual([col.id]);
  });
});

describe('BoardService.rename / recolor / reorder', () => {
  it('rename patches the title (allowed on a system column)', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ lifecycleKey: 'active' }));
    const r = await service.renameColumn(col.id, '새이름', 'ws-buyer');
    expect(r.ok).toBe(true);
    expect(columnRepo.updated).toEqual([{ id: col.id, patch: { title: '새이름' } }]);
  });

  it('recolor patches the color (null clears)', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn());
    expect((await service.recolorColumn(col.id, 'primary', 'ws-buyer')).ok).toBe(true);
    expect((await service.recolorColumn(col.id, null, 'ws-buyer')).ok).toBe(true);
    expect(columnRepo.updated).toEqual([
      { id: col.id, patch: { color: 'primary' } },
      { id: col.id, patch: { color: null } },
    ]);
  });

  it('reorder patches the position', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn());
    const r = await service.reorderColumn(col.id, 'm5', 'ws-buyer');
    expect(r.ok).toBe(true);
    expect(columnRepo.updated).toEqual([{ id: col.id, patch: { position: 'm5' } }]);
  });

  it('FORBIDDEN when mutating a column in another workspace', async () => {
    const { service, columnRepo } = build();
    const col = columnRepo.seed(makeColumn({ workspaceId: 'ws-other' }));
    expect(await service.renameColumn(col.id, 'x', 'ws-buyer')).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('board service factory', () => {
  afterEach(() => {
    __resetBoardServiceForTest();
  });

  it('__setBoardServiceForTest overrides the global singleton', async () => {
    const { service } = build();
    __setBoardServiceForTest(service);
    expect(await getBoardService()).toBe(service);
  });
});

afterEach(() => {
  __resetBoardServiceForTest();
});
beforeEach(() => {
  __resetBoardServiceForTest();
});
