import { and, desc, eq } from 'drizzle-orm';

import { riskFlags } from '@/lib/db/schema';
import type { RiskFlagRepo, RiskFlagRecord, RaiseRiskFlagParams, Tx } from '../types';

export class DrizzleRiskFlagRepository implements RiskFlagRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async raise(params: RaiseRiskFlagParams, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // id·createdAt 은 DB 기본값에 맡긴다. resolvedAt/resolvedBy 는 admin 콘솔이
    // 해소할 때 채우므로 생성 시엔 비워 둔다.
    await db.insert(riskFlags).values({
      entityType: params.entityType,
      entityId: params.entityId,
      flagType: params.flagType,
      severity: params.severity,
    });
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    tx?: Tx,
  ): Promise<RiskFlagRecord[]> {
    const db = this.h(tx);
    const rows = await db
      .select({
        id: riskFlags.id,
        entityType: riskFlags.entityType,
        entityId: riskFlags.entityId,
        flagType: riskFlags.flagType,
        severity: riskFlags.severity,
        resolvedAt: riskFlags.resolvedAt,
        createdAt: riskFlags.createdAt,
      })
      .from(riskFlags)
      .where(and(eq(riskFlags.entityType, entityType), eq(riskFlags.entityId, entityId)))
      .orderBy(desc(riskFlags.createdAt));
    return rows as RiskFlagRecord[];
  }
}
