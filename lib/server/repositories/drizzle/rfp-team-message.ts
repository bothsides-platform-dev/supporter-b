import { and, asc, eq } from 'drizzle-orm';
import { rfpTeamMessages, users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  RfpTeamMessageRecord,
  RfpTeamMessageRepo,
  RfpTeamMessageWithAuthor,
  Tx,
} from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift where select().from() would compile the full column list.
const TEAM_MESSAGE_COLUMNS = {
  id: rfpTeamMessages.id,
  rfpId: rfpTeamMessages.rfpId,
  workspaceId: rfpTeamMessages.workspaceId,
  authorUserId: rfpTeamMessages.authorUserId,
  body: rfpTeamMessages.body,
  createdAt: rfpTeamMessages.createdAt,
  authorName: users.name,
} as const;

export class DrizzleRfpTeamMessageRepository implements RfpTeamMessageRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(msg: RfpTeamMessageRecord, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(rfpTeamMessages).values({
      id: msg.id,
      rfpId: msg.rfpId,
      workspaceId: msg.workspaceId,
      authorUserId: msg.authorUserId,
      body: msg.body,
      createdAt: msg.createdAt,
    });
  }

  async listByScope(
    rfpId: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<RfpTeamMessageWithAuthor[]> {
    const db = this.h(tx);
    return (await db
      .select(TEAM_MESSAGE_COLUMNS)
      .from(rfpTeamMessages)
      .innerJoin(users, eq(users.id, rfpTeamMessages.authorUserId))
      .where(
        and(
          eq(rfpTeamMessages.rfpId, rfpId),
          eq(rfpTeamMessages.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(rfpTeamMessages.createdAt))) as RfpTeamMessageWithAuthor[];
  }
}
