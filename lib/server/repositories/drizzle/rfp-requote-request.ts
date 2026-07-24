import { and, asc, eq } from 'drizzle-orm';
import { rfpRequoteRequests } from '@/lib/db/schema';
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';
import type { RfpRequoteRequestRepo, Tx } from '../types';

type Db = Tx;

type Row = typeof rfpRequoteRequests.$inferSelect;

function rowToReq(r: Row): RfpRequoteRequest {
  return {
    id: r.id,
    rfpId: r.rfpId,
    pgWsId: r.pgWsId,
    round: r.round,
    message: r.message,
    deadline: r.deadline.toISOString(),
    status: r.status,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : undefined,
  };
}

export class DrizzleRfpRequoteRequestRepository implements RfpRequoteRequestRepo {
  constructor(private readonly db: Db) {}
  private h(tx?: Tx): Db {
    return tx ?? this.db;
  }

  async create(req: RfpRequoteRequest, tx?: Tx): Promise<void> {
    await this.h(tx).insert(rfpRequoteRequests).values({
      id: req.id,
      rfpId: req.rfpId,
      pgWsId: req.pgWsId,
      round: req.round,
      message: req.message,
      deadline: new Date(req.deadline),
      status: req.status,
      createdByUserId: req.createdByUserId,
      createdAt: new Date(req.createdAt),
      respondedAt: req.respondedAt ? new Date(req.respondedAt) : null,
    });
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<RfpRequoteRequest[]> {
    const rows = (await this.h(tx)
      .select()
      .from(rfpRequoteRequests)
      .where(eq(rfpRequoteRequests.rfpId, rfpId))
      .orderBy(asc(rfpRequoteRequests.createdAt))) as Row[];
    return rows.map(rowToReq);
  }

  async findPendingByPair(
    rfpId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<RfpRequoteRequest | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(rfpRequoteRequests)
      .where(
        and(
          eq(rfpRequoteRequests.rfpId, rfpId),
          eq(rfpRequoteRequests.pgWsId, pgWsId),
          eq(rfpRequoteRequests.status, 'pending'),
        ),
      )
      .limit(1)) as Row[];
    return row ? rowToReq(row) : undefined;
  }

  async findPendingByPgWs(pgWsId: string, tx?: Tx): Promise<RfpRequoteRequest[]> {
    const rows = (await this.h(tx)
      .select()
      .from(rfpRequoteRequests)
      .where(
        and(
          eq(rfpRequoteRequests.pgWsId, pgWsId),
          eq(rfpRequoteRequests.status, 'pending'),
        ),
      )) as Row[];
    return rows.map(rowToReq);
  }

  async markResponded(id: string, at: Date, tx?: Tx): Promise<void> {
    await this.h(tx)
      .update(rfpRequoteRequests)
      .set({ status: 'responded', respondedAt: at })
      .where(and(eq(rfpRequoteRequests.id, id), eq(rfpRequoteRequests.status, 'pending')));
  }
}
