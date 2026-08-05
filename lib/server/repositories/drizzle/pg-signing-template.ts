import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { pgSigningTemplates } from '@/lib/db/schema';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { PgSigningTemplateRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — 스키마 드리프트 가드.
const TEMPLATE_COLUMNS = {
  id: pgSigningTemplates.id,
  workspaceId: pgSigningTemplates.workspaceId,
  snowsignTemplateId: pgSigningTemplates.snowsignTemplateId,
  name: pgSigningTemplates.name,
  createdBy: pgSigningTemplates.createdBy,
  createdAt: pgSigningTemplates.createdAt,
} as const;

type TemplateRow = {
  [K in keyof typeof TEMPLATE_COLUMNS]: (typeof pgSigningTemplates.$inferSelect)[K];
};

function rowToTemplate(row: TemplateRow): PgSigningTemplate {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    snowsignTemplateId: row.snowsignTemplateId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzlePgSigningTemplateRepository implements PgSigningTemplateRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    template: {
      id?: string;
      workspaceId: string;
      snowsignTemplateId: string;
      name: string;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(pgSigningTemplates).values({
      id: template.id ?? randomUUID(),
      workspaceId: template.workspaceId,
      snowsignTemplateId: template.snowsignTemplateId,
      name: template.name,
      createdBy: template.createdBy,
    });
  }

  async findById(id: string, tx?: Tx): Promise<PgSigningTemplate | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select(TEMPLATE_COLUMNS)
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.id, id))
      .limit(1)) as TemplateRow[];
    return row ? rowToTemplate(row) : undefined;
  }

  async listByWorkspace(workspaceId: string, tx?: Tx): Promise<PgSigningTemplate[]> {
    const db = this.h(tx);
    const rows = (await db
      .select(TEMPLATE_COLUMNS)
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.workspaceId, workspaceId))
      .orderBy(asc(pgSigningTemplates.createdAt))) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  async updateName(id: string, name: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(pgSigningTemplates).set({ name }).where(eq(pgSigningTemplates.id, id));
  }

  async updateProviderTemplate(
    id: string,
    snowsignTemplateId: string,
    name: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(pgSigningTemplates)
      .set({ snowsignTemplateId, name })
      .where(eq(pgSigningTemplates.id, id));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(pgSigningTemplates).where(eq(pgSigningTemplates.id, id));
  }
}
