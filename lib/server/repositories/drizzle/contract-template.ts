import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { contractTemplates, attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { ContractTemplate } from '@/lib/types/contract-doc';
import type { ContractTemplateRepo, Tx } from '../types';

type TemplateRow = typeof contractTemplates.$inferSelect;
type AttachmentInfo = { id: string; name: string; size: number };

function rowToTemplate(row: TemplateRow, attachment: AttachmentInfo | null): ContractTemplate {
  return {
    id: row.id,
    pgWsId: row.pgWsId,
    name: row.name,
    description: row.description,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    attachment,
  };
}

export class DrizzleContractTemplateRepository implements ContractTemplateRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  // Batched ready-attachment hydration — one query for all template ids (no
  // N+1). A template could in principle have more than one 'ready' attachment
  // row over its lifetime (re-upload); the most recently uploaded one wins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async attachmentsByTemplate(db: any, templateIds: string[]): Promise<Map<string, AttachmentInfo>> {
    const map = new Map<string, AttachmentInfo>();
    if (templateIds.length === 0) return map;
    const rows = await db
      .select({
        templateId: attachments.contractTemplateId,
        id: attachments.id,
        name: attachments.name,
        size: attachments.size,
      })
      .from(attachments)
      .where(
        and(inArray(attachments.contractTemplateId, templateIds), eq(attachments.status, 'ready')),
      )
      .orderBy(desc(attachments.uploadedAt));
    for (const r of rows as { templateId: string | null; id: string; name: string; size: number }[]) {
      if (!r.templateId || map.has(r.templateId)) continue; // first hit wins (desc order = latest)
      map.set(r.templateId, { id: r.id, name: r.name, size: r.size });
    }
    return map;
  }

  async create(
    t: { id: string; pgWsId: string; name: string; description: string; createdBy: string },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(contractTemplates).values({
      id: t.id,
      pgWsId: t.pgWsId,
      name: t.name,
      description: t.description,
      createdBy: t.createdBy,
    });
  }

  async findById(id: string, tx?: Tx): Promise<ContractTemplate | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, id))
      .limit(1);
    if (!row) return undefined;
    const attachmentMap = await this.attachmentsByTemplate(db, [row.id]);
    return rowToTemplate(row, attachmentMap.get(row.id) ?? null);
  }

  async listByWorkspace(pgWsId: string, tx?: Tx): Promise<ContractTemplate[]> {
    const db = this.h(tx);
    const rows: TemplateRow[] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.pgWsId, pgWsId))
      .orderBy(desc(contractTemplates.createdAt));
    const attachmentMap = await this.attachmentsByTemplate(
      db,
      rows.map((r) => r.id),
    );
    return rows.map((row) => rowToTemplate(row, attachmentMap.get(row.id) ?? null));
  }

  async countByWorkspace(pgWsId: string, tx?: Tx): Promise<number> {
    const db = this.h(tx);
    const [{ value }] = await db
      .select({ value: count() })
      .from(contractTemplates)
      .where(eq(contractTemplates.pgWsId, pgWsId));
    return value;
  }

  async delete(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }
}
