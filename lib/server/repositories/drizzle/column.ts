import { and, asc, eq } from 'drizzle-orm';
import { columns } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { BoardColumn, ChipColorRole, ColumnKind } from '@/lib/types/column';
import type { ColumnRepo, Tx } from '../types';

type ColumnRow = typeof columns.$inferSelect;

function rowToColumn(row: ColumnRow): BoardColumn {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    position: row.position,
    color: row.color as ChipColorRole | null,
    lifecycleKey: row.lifecycleKey,
    isSystem: row.isSystem,
  };
}

export class DrizzleColumnRepository implements ColumnRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async listByBoard(
    workspaceId: string,
    kind: ColumnKind,
    tx?: Tx,
  ): Promise<BoardColumn[]> {
    const db = this.h(tx);
    const rows = (await db
      .select()
      .from(columns)
      .where(and(eq(columns.workspaceId, workspaceId), eq(columns.kind, kind)))
      .orderBy(asc(columns.position))) as ColumnRow[];
    return rows.map(rowToColumn);
  }

  async findById(id: string, tx?: Tx): Promise<BoardColumn | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select()
      .from(columns)
      .where(eq(columns.id, id))
      .limit(1)) as ColumnRow[];
    return row ? rowToColumn(row) : undefined;
  }

  async create(col: BoardColumn, tx?: Tx): Promise<void> {
    await this.createMany([col], tx);
  }

  async createMany(cols: BoardColumn[], tx?: Tx): Promise<void> {
    if (cols.length === 0) return;
    const db = this.h(tx);
    await db.insert(columns).values(
      cols.map((c) => ({
        id: c.id,
        workspaceId: c.workspaceId,
        kind: c.kind,
        title: c.title,
        position: c.position,
        color: c.color,
        lifecycleKey: c.lifecycleKey,
        isSystem: c.isSystem,
      })),
    );
  }

  async update(
    id: string,
    patch: Partial<Pick<BoardColumn, 'title' | 'color' | 'position'>>,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(columns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(columns.id, id));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(columns).where(eq(columns.id, id));
  }
}
