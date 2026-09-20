import { eq } from 'drizzle-orm';
import {
  pgAgreementRates,
  signingAgreementDrafts,
  signingContracts,
  workspaces,
} from '@/lib/db/schema';
import { AgreementDraftSchema, type AgreementParties } from '@/lib/contract-doc/agreement';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import type { SentContractSnapshot } from '@/lib/types/signing';
import type { Tx } from '../types';

export class DrizzleAgreementRepository {
  // Same transaction handle as services; Postgres and PGlite share this seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  async findRates(pgWsId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(pgAgreementRates)
      .where(eq(pgAgreementRates.pgWsId, pgWsId));
    return row;
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
