import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { chatMessageTemplates } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { ChatMessageTemplate, ChatTemplateRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift where select().from() would compile the full column list.
const TEMPLATE_COLUMNS = {
  id: chatMessageTemplates.id,
  workspaceId: chatMessageTemplates.workspaceId,
  title: chatMessageTemplates.title,
  body: chatMessageTemplates.body,
  createdBy: chatMessageTemplates.createdBy,
  createdAt: chatMessageTemplates.createdAt,
  updatedAt: chatMessageTemplates.updatedAt,
} as const;

export class DrizzleChatTemplateRepository implements ChatTemplateRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async create(
    template: {
      id?: string;
      workspaceId: string;
      title: string;
      body: string;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(chatMessageTemplates).values({
      id: template.id ?? randomUUID(),
      workspaceId: template.workspaceId,
      title: template.title,
      body: template.body,
      createdBy: template.createdBy,
    });
  }

  async findById(id: string, tx?: Tx): Promise<ChatMessageTemplate | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select(TEMPLATE_COLUMNS)
      .from(chatMessageTemplates)
      .where(eq(chatMessageTemplates.id, id))
      .limit(1);
    return row ?? undefined;
  }

  async listByWorkspace(
    workspaceId: string,
    tx?: Tx,
  ): Promise<ChatMessageTemplate[]> {
    const db = this.h(tx);
    return (await db
      .select(TEMPLATE_COLUMNS)
      .from(chatMessageTemplates)
      .where(eq(chatMessageTemplates.workspaceId, workspaceId))
      .orderBy(asc(chatMessageTemplates.createdAt))) as ChatMessageTemplate[];
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(chatMessageTemplates).where(eq(chatMessageTemplates.id, id));
  }
}
