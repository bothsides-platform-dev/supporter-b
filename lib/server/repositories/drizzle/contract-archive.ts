import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { contractArchives, rfps, signingContracts, workspaces } from '@/lib/db/schema';
import type { ContractArchive } from '@/lib/types/contract-archive';
import type { ContractArchiveRepo, Tx } from '../types';

// 명시 projection (BID_COLUMNS 전례) — 스키마 드리프트 가드.
const ARCHIVE_COLUMNS = {
  id: contractArchives.id,
  workspaceId: contractArchives.workspaceId,
  source: contractArchives.source,
  signingContractId: contractArchives.signingContractId,
  rfpCode: contractArchives.rfpCode,
  title: contractArchives.title,
  counterpartyName: contractArchives.counterpartyName,
  contractedAt: contractArchives.contractedAt,
  status: contractArchives.status,
  documentKey: contractArchives.documentKey,
  documentName: contractArchives.documentName,
  documentSize: contractArchives.documentSize,
  auditKey: contractArchives.auditKey,
  auditName: contractArchives.auditName,
  attempts: contractArchives.attempts,
  createdBy: contractArchives.createdBy,
  createdAt: contractArchives.createdAt,
} as const;

type ArchiveRow = {
  [K in keyof typeof ARCHIVE_COLUMNS]: (typeof contractArchives.$inferSelect)[K];
};

type PendingUploadInsert = {
  id: string;
  workspaceId: string;
  title: string;
  counterpartyName?: string | null;
  contractedAt?: Date | null;
  documentKey: string;
  documentName: string;
  documentSize: number;
  createdBy: string;
};

function rowToArchive(row: ArchiveRow): ContractArchive {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    source: row.source as ContractArchive['source'],
    signingContractId: row.signingContractId,
    rfpCode: row.rfpCode,
    title: row.title,
    counterpartyName: row.counterpartyName,
    contractedAt: row.contractedAt ? row.contractedAt.toISOString() : null,
    status: row.status as ContractArchive['status'],
    documentKey: row.documentKey,
    documentName: row.documentName,
    documentSize: row.documentSize,
    auditKey: row.auditKey,
    auditName: row.auditName,
    attempts: row.attempts,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleContractArchiveRepository implements ContractArchiveRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async insertPendingSigningPair(
    rows: Array<{
      workspaceId: string;
      signingContractId: string;
      rfpCode: string;
      title: string;
      counterpartyName: string | null;
      contractedAt: Date | null;
    }>,
    tx?: Tx,
  ): Promise<void> {
    if (rows.length === 0) return;
    const db = this.h(tx);
    await db
      .insert(contractArchives)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          source: 'signing' as const,
          signingContractId: r.signingContractId,
          rfpCode: r.rfpCode,
          title: r.title,
          counterpartyName: r.counterpartyName,
          contractedAt: r.contractedAt,
          status: 'pending' as const,
        })),
      )
      .onConflictDoNothing();
  }

  private async insertPendingUpload(
    row: PendingUploadInsert,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(contractArchives).values({
      id: row.id,
      workspaceId: row.workspaceId,
      source: 'upload',
      title: row.title,
      counterpartyName: row.counterpartyName ?? null,
      contractedAt: row.contractedAt ?? null,
      status: 'pending',
      documentKey: row.documentKey,
      documentName: row.documentName,
      documentSize: row.documentSize,
      createdBy: row.createdBy,
    });
  }

  async insertPendingUploadWithinCap(
    row: PendingUploadInsert,
    cap: number,
  ): Promise<boolean> {
    const root = this._db as Tx & {
      transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T>;
    };
    return root.transaction(async (tx) => {
      // A waiting transaction acquires this row before taking the count's
      // fresh statement snapshot, so two presigns cannot both claim slot 200.
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, row.workspaceId))
        .for('update');
      if ((await this.countUploadsByWorkspace(row.workspaceId, tx)) >= cap) {
        return false;
      }
      await this.insertPendingUpload(row, tx);
      return true;
    });
  }

  async findById(id: string, tx?: Tx): Promise<ContractArchive | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select(ARCHIVE_COLUMNS)
      .from(contractArchives)
      .where(eq(contractArchives.id, id))
      .limit(1)) as ArchiveRow[];
    return row ? rowToArchive(row) : undefined;
  }

  async listByWorkspace(workspaceId: string, tx?: Tx): Promise<ContractArchive[]> {
    const db = this.h(tx);
    const rows = (await db
      .select(ARCHIVE_COLUMNS)
      .from(contractArchives)
      .where(eq(contractArchives.workspaceId, workspaceId))
      .orderBy(
        sql`coalesce(${contractArchives.contractedAt}, ${contractArchives.createdAt}) desc`,
      )) as ArchiveRow[];
    return rows.map(rowToArchive);
  }

  async findPendingSigningGroups(
    limit: number,
    tx?: Tx,
  ): Promise<Array<{ signingContractId: string; attempts: number; rfpCode: string | null }>> {
    const db = this.h(tx);
    // signingContractId IS NOT NULL 필수: RFP 삭제로 SET NULL 된 고아 pending 은
    // 여기서 걸러야 한다 — SQL LIMIT 이 먼저 적용되므로 JS 필터로 나중에 버리면
    // 그 고아가 매 사이클 예산 슬롯을 영구 소모한다(failOrphanedSigningPending 이
    // 그 고아를 처리하는 별도 경로).
    const rows = (await db
      .select({
        signingContractId: contractArchives.signingContractId,
        attempts: sql<number>`max(${contractArchives.attempts})`,
        rfpCode: sql<string | null>`min(${contractArchives.rfpCode})`,
      })
      .from(contractArchives)
      .where(
        and(
          eq(contractArchives.status, 'pending'),
          eq(contractArchives.source, 'signing'),
          isNotNull(contractArchives.signingContractId),
        ),
      )
      .groupBy(contractArchives.signingContractId)
      .orderBy(sql`min(${contractArchives.createdAt}) asc`)
      .limit(limit)) as Array<{
      signingContractId: string | null;
      attempts: number;
      rfpCode: string | null;
    }>;
    return rows.map((r) => ({
      signingContractId: r.signingContractId as string,
      attempts: Number(r.attempts),
      rfpCode: r.rfpCode,
    }));
  }

  async markSigningReady(
    signingContractId: string,
    doc: {
      documentKey: string;
      documentName: string;
      documentSize: number;
      auditKey: string;
      auditName: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(contractArchives)
      .set({ status: 'ready', ...doc })
      .where(
        and(
          eq(contractArchives.signingContractId, signingContractId),
          eq(contractArchives.status, 'pending'),
        ),
      );
  }

  async recordSigningAttempt(signingContractId: string, at: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(contractArchives)
      .set({ attempts: sql`${contractArchives.attempts} + 1`, lastAttemptAt: at })
      .where(
        and(
          eq(contractArchives.signingContractId, signingContractId),
          eq(contractArchives.status, 'pending'),
        ),
      );
  }

  async markSigningFailed(signingContractId: string, at: Date, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(contractArchives)
      .set({ status: 'failed', lastAttemptAt: at })
      .where(
        and(
          eq(contractArchives.signingContractId, signingContractId),
          eq(contractArchives.status, 'pending'),
        ),
      );
  }

  async failOrphanedSigningPending(at: Date, tx?: Tx): Promise<number> {
    const db = this.h(tx);
    const rows = (await db
      .update(contractArchives)
      .set({ status: 'failed', lastAttemptAt: at })
      .where(
        and(
          eq(contractArchives.source, 'signing'),
          eq(contractArchives.status, 'pending'),
          isNull(contractArchives.signingContractId),
        ),
      )
      .returning({ id: contractArchives.id })) as { id: string }[];
    return rows.length;
  }

  async markUploadReady(id: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = (await db
      .update(contractArchives)
      .set({ status: 'ready' })
      .where(
        and(
          eq(contractArchives.id, id),
          eq(contractArchives.source, 'upload'),
          eq(contractArchives.status, 'pending'),
        ),
      )
      .returning({ id: contractArchives.id })) as { id: string }[];
    return rows.length > 0;
  }

  private async countUploadsByWorkspace(workspaceId: string, tx?: Tx): Promise<number> {
    const db = this.h(tx);
    const [row] = (await db
      .select({ n: sql<number>`count(*)` })
      .from(contractArchives)
      .where(
        and(
          eq(contractArchives.workspaceId, workspaceId),
          eq(contractArchives.source, 'upload'),
        ),
      )) as { n: number }[];
    return Number(row?.n ?? 0);
  }

  async findCompletedContractsMissingArchive(limit: number, tx?: Tx): Promise<string[]> {
    const db = this.h(tx);
    const rows = (await db
      .select({ id: signingContracts.id })
      .from(signingContracts)
      .leftJoin(contractArchives, eq(contractArchives.signingContractId, signingContracts.id))
      .innerJoin(rfps, eq(rfps.id, signingContracts.rfpId))
      .where(
        and(
          eq(signingContracts.status, 'completed'),
          isNull(contractArchives.id),
          // 낙찰 포인터(awardedBidId)가 없으면 createPendingForContract 가 항상
          // RFP_NOT_FOUND 로 실패한다(재요청/삭제로 소실된 경우 등) — 후보에
          // 남기면 이 스윕이 영구 실패 건에 예산을 매번 뺏겨 다른 건을 굶긴다.
          isNotNull(rfps.awardedBidId),
        ),
      )
      .orderBy(asc(signingContracts.completedAt))
      .limit(limit)) as { id: string }[];
    return rows.map((r) => r.id);
  }

  async deleteStaleUploadPending(
    cutoff: Date,
    limit: number,
    tx?: Tx,
  ): Promise<Array<{ id: string; documentKey: string | null }>> {
    const db = this.h(tx);
    const stale = and(
      eq(contractArchives.source, 'upload'),
      eq(contractArchives.status, 'pending'),
      lt(contractArchives.createdAt, cutoff),
    );
    // 상한이 필요한 이유는 첨부 스윕과 같다 — 호출자가 삭제된 행마다 R2 객체를
    // 지우는데, 행은 이미 커밋돼 있어 그 루프가 닿지 못한 객체는 통째로 고아가
    // 된다(가리키는 것이 아무것도 남지 않는다). DELETE 에 LIMIT 이 없어 서브쿼리로
    // 표현한다. 남은 것은 다음 틱이 가져간다.
    return (await db
      .delete(contractArchives)
      .where(
        inArray(
          contractArchives.id,
          db.select({ id: contractArchives.id }).from(contractArchives).where(stale).limit(limit),
        ),
      )
      .returning({
        id: contractArchives.id,
        documentKey: contractArchives.documentKey,
      })) as Array<{ id: string; documentKey: string | null }>;
  }

  async removeUpload(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .delete(contractArchives)
      .where(and(eq(contractArchives.id, id), eq(contractArchives.source, 'upload')));
  }

  async removePendingUpload(id: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .delete(contractArchives)
      .where(
        and(
          eq(contractArchives.id, id),
          eq(contractArchives.source, 'upload'),
          eq(contractArchives.status, 'pending'),
        ),
      )
      .returning({ id: contractArchives.id });
    return rows.length === 1;
  }
}
