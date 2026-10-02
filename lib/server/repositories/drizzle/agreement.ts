import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  bids,
  rfps,
  pgAgreementRates,
  pgProfiles,
  signingAgreementDrafts,
  signingContracts,
  workspaces,
} from '@/lib/db/schema';
import { AgreementDraftSchema, AgreementPartiesSchema, type AgreementParties } from '@/lib/contract-doc/agreement';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import type { SentContractSnapshot } from '@/lib/types/signing';
import type { Tx } from '../types';
import type { PgContractSummary } from '@/lib/signing/pg-contract-action';

const REUSE_CANDIDATES = 5;

export class DrizzleAgreementRepository {
  // Same transaction handle as services; Postgres and PGlite share this seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  /** 선정된 PG만 조회한다. 최신 회차의 상태만 반환하고 문서·연락처·공급자 ID는 제외한다. */
  async findPgContractSummaries(pgWsId: string, rfpIds?: string[]): Promise<PgContractSummary[]> {
    if (rfpIds?.length === 0) return [];
    const tx: Tx = this.db;
    return tx.selectDistinctOn([signingContracts.rfpId], {
      rfpId: rfps.id,
      rfpCode: rfps.code,
      rfpTitle: rfps.title,
      buyerName: workspaces.name,
      status: signingContracts.status,
      revision: sql<number>`coalesce(${signingAgreementDrafts.revision}, 0)`.mapWith(Number),
      hasProviderRef: sql<boolean>`${signingContracts.providerRef} is not null`,
      hasPrepared: sql<boolean>`${signingAgreementDrafts.prepared} is not null`,
    })
      .from(signingContracts)
      .innerJoin(rfps, eq(rfps.id, signingContracts.rfpId))
      .innerJoin(bids, and(eq(bids.id, rfps.awardedBidId), eq(bids.rfpId, rfps.id)))
      .innerJoin(workspaces, eq(workspaces.id, rfps.buyerWsId))
      .leftJoin(signingAgreementDrafts, eq(signingAgreementDrafts.contractId, signingContracts.id))
      .where(and(eq(rfps.status, 'awarded'), eq(bids.pgWsId, pgWsId),
        rfpIds ? inArray(rfps.id, rfpIds) : undefined))
      .orderBy(signingContracts.rfpId, desc(signingContracts.round));
  }

  async findRates(pgWsId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(pgAgreementRates)
      .where(eq(pgAgreementRates.pgWsId, pgWsId));
    return row;
  }

  async findPgBizNo(pgWsId: string, tx: Tx = this.db): Promise<string | undefined> {
    const [row] = await tx.select({ bizNo: pgProfiles.bizNo })
      .from(pgProfiles).where(eq(pgProfiles.workspaceId, pgWsId));
    return row?.bizNo ?? undefined;
  }

  /** Defaults remain private to the PG that saved them. Never copy a buyer's
   * company fields from another PG's drafts or write them into a shared profile.
   * Fetch one complete company per side, not the entire document history. */
  async findReusableParties(pgWsId: string, buyerWsId: string, tx: Tx = this.db) {
    const find = async (side: 'buyer' | 'pg') => {
      const party = sql`${signingAgreementDrafts.parties} -> ${side}`;
      const rows = await tx.select({ party: sql<unknown>`${party}` })
        .from(signingAgreementDrafts)
        .innerJoin(signingContracts, eq(signingContracts.id, signingAgreementDrafts.contractId))
        .innerJoin(rfps, eq(rfps.id, signingContracts.rfpId))
        .innerJoin(bids, and(eq(bids.id, rfps.awardedBidId), eq(bids.rfpId, rfps.id)))
        .where(and(
          eq(bids.pgWsId, pgWsId),
          side === 'buyer' ? eq(rfps.buyerWsId, buyerWsId) : undefined,
          // Incomplete draft saves must not replace the last usable defaults.
          sql`${party} ->> 'company' ~ '[^[:space:]]'`,
          sql`${party} ->> 'address' ~ '[^[:space:]]'`,
          sql`${party} ->> 'representative' ~ '[^[:space:]]'`,
          sql`replace(${party} ->> 'bizNo', '-', '') ~ '^[0-9]{10}$'`,
        ))
        .orderBy(desc(signingAgreementDrafts.updatedAt), desc(signingAgreementDrafts.contractId))
        // The SQL filter is a cheap pre-filter; the schema is the authority. Read a
        // few candidates so one row that passes SQL but fails the schema (length,
        // whitespace the DB locale does not treat as space) cannot hide an older
        // complete draft.
        .limit(REUSE_CANDIDATES);
      for (const { party: value } of rows) {
        const parsed = AgreementPartiesSchema.shape[side].safeParse(value);
        if (parsed.success) return parsed.data;
      }
      return undefined;
    };
    const [buyer, pg] = await Promise.all([find('buyer'), find('pg')]);
    return { buyer, pg };
  }

  async lockPg(pgWsId: string, tx: Tx) {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, pgWsId))
      .for('update');
  }

  async lockContract(contractId: string, tx: Tx) {
    await tx
      .select({ id: signingContracts.id })
      .from(signingContracts)
      .where(eq(signingContracts.id, contractId))
      .for('update');
  }

  async findDraft(contractId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(signingAgreementDrafts)
      .where(eq(signingAgreementDrafts.contractId, contractId));
    return row;
  }

  async saveDraft(
    contractId: string,
    revision: number,
    input: AgreementParties,
  ): Promise<number | undefined> {
    const parsed = AgreementDraftSchema.safeParse(input);
    if (!parsed.success) return undefined;
    return this.db.transaction(async (tx: Tx) => {
      const [contract] = await tx
        .select({
          status: signingContracts.status,
          ref: signingContracts.providerRef,
          claimed: signingContracts.claimedForSendAt,
        })
        .from(signingContracts)
        .where(eq(signingContracts.id, contractId))
        .for('update');
      if (
        !contract ||
        contract.status !== 'awaiting_pg_template' ||
        contract.ref ||
        (contract.claimed && contract.claimed.getTime() > Date.now() - EMBED_SEND_LEASE_MS)
      )
        return undefined;
      const draft = await this.findDraft(contractId, tx);
      if ((draft?.revision ?? 0) !== revision) return undefined;
      await tx
        .insert(signingAgreementDrafts)
        .values({ contractId, revision: revision + 1, parties: parsed.data })
        .onConflictDoUpdate({
          target: signingAgreementDrafts.contractId,
          set: {
            revision: revision + 1,
            parties: parsed.data,
            prepared: null,
            updatedAt: new Date(),
          },
        });
      // A successful edit replaces prepared. Invalidate an expired sender under
      // the same contract lock so its late create response cannot bind an old PDF
      // to this revision, even if nobody claims another send lease.
      if (contract.claimed) {
        await tx
          .update(signingContracts)
          .set({ claimedForSendAt: null, claimedForSendBy: null })
          .where(eq(signingContracts.id, contractId));
      }
      return revision + 1;
    });
  }

  async prepare(contractId: string, snapshot: SentContractSnapshot, tx: Tx) {
    await tx
      .update(signingAgreementDrafts)
      .set({ prepared: snapshot })
      .where(eq(signingAgreementDrafts.contractId, contractId));
  }
}
