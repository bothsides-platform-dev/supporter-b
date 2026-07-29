import { and, desc, eq } from 'drizzle-orm';
import { pgSigningTemplates } from '@/lib/db/schema';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { PgSigningTemplateRepo, Tx } from '../types';

type Db = Tx;

type Row = typeof pgSigningTemplates.$inferSelect;

function rowToTemplate(r: Row): PgSigningTemplate {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    snowsignTemplateId: r.snowsignTemplateId,
    name: r.name,
    roleMapping: r.roleMapping,
    variableMapping: r.variableMapping,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export class DrizzlePgSigningTemplateRepository implements PgSigningTemplateRepo {
  constructor(private readonly db: Db) {}
  private h(tx?: Tx): Db {
    return tx ?? this.db;
  }

  async create(t: PgSigningTemplate, tx?: Tx): Promise<void> {
    await this.h(tx).insert(pgSigningTemplates).values({
      id: t.id,
      workspaceId: t.workspaceId,
      snowsignTemplateId: t.snowsignTemplateId,
      name: t.name,
      roleMapping: t.roleMapping,
      variableMapping: t.variableMapping,
      createdBy: t.createdBy,
      createdAt: new Date(t.createdAt),
    });
  }

  async findByWorkspace(workspaceId: string, tx?: Tx): Promise<PgSigningTemplate[]> {
    const rows = (await this.h(tx)
      .select()
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.workspaceId, workspaceId))
      .orderBy(desc(pgSigningTemplates.createdAt))) as Row[];
    return rows.map(rowToTemplate);
  }

  /** org 스코핑: id 와 소유 workspaceId 가 함께 일치해야만 반환. */
  async findByIdScoped(
    id: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<PgSigningTemplate | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(pgSigningTemplates)
      .where(and(eq(pgSigningTemplates.id, id), eq(pgSigningTemplates.workspaceId, workspaceId)))
      .limit(1)) as Row[];
    return row ? rowToTemplate(row) : undefined;
  }

  async findBySnowsignTemplateId(
    snowsignTemplateId: string,
    tx?: Tx,
  ): Promise<PgSigningTemplate | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.snowsignTemplateId, snowsignTemplateId))
      .limit(1)) as Row[];
    return row ? rowToTemplate(row) : undefined;
  }

  async updateName(id: string, workspaceId: string, name: string, tx?: Tx): Promise<boolean> {
    const rows = (await this.h(tx)
      .update(pgSigningTemplates)
      .set({ name })
      .where(and(eq(pgSigningTemplates.id, id), eq(pgSigningTemplates.workspaceId, workspaceId)))
      .returning({ id: pgSigningTemplates.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async remove(id: string, workspaceId: string, tx?: Tx): Promise<boolean> {
    const rows = (await this.h(tx)
      .delete(pgSigningTemplates)
      .where(and(eq(pgSigningTemplates.id, id), eq(pgSigningTemplates.workspaceId, workspaceId)))
      .returning({ id: pgSigningTemplates.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }
}
