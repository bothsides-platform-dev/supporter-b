import { createHash } from 'node:crypto';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import {
  getAgreementRepo,
  getBidRepo,
  getDb,
  getRfpRepo,
  getSigningContractRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  AGREEMENT_VERSION,
  AgreementDraftSchema,
  AgreementPartiesSchema,
  buildAgreementDocument,
  buildAgreementFees,
} from '@/lib/contract-doc/agreement';
import type { AgreementView, AgreementSnapshot } from '@/lib/types/agreement';
import type { Actor, ServiceResult } from './types';
import type { Tx } from '@/lib/server/repositories/types';
import { resolveSecurityMethod } from '@/lib/signing/security-method';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';

export class AgreementService {
  constructor(
    private readonly deps: {
      agreement: Awaited<ReturnType<typeof getAgreementRepo>>;
      signing: Awaited<ReturnType<typeof getSigningContractRepo>>;
      rfp: Awaited<ReturnType<typeof getRfpRepo>>;
      bid: Awaited<ReturnType<typeof getBidRepo>>;
      user: Awaited<ReturnType<typeof getUserRepo>>;
      workspace: Awaited<ReturnType<typeof getWorkspaceRepo>>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: any;
    },
  ) {}

  private async context(contractId: string, actor: Actor, tx?: Tx) {
    const found = await this.deps.signing.findById(contractId, tx);
    const rfp = found ? await this.deps.rfp.findById(found.contract.rfpId, tx) : undefined;
    const bid = rfp?.awardedBidId ? await this.deps.bid.findById(rfp.awardedBidId, tx) : undefined;
    if (
      !found ||
      !rfp ||
      !bid ||
      (rfp.buyerWsId !== actor.workspaceId && bid.pgWsId !== actor.workspaceId)
    )
      return undefined;
    return {
      contract: found.contract,
      rfp,
      bid,
      side: actor.workspaceId === bid.pgWsId ? ('pg' as const) : ('buyer' as const),
    };
  }

  async load(
    contractId: string,
    actor: Actor,
    tx?: Tx,
  ): Promise<AgreementView | ServiceResult<{ mode: 'legacy' }>> {
    const ctx = await this.context(contractId, actor, tx);
    if (!ctx) return { ok: false, error: 'FORBIDDEN' };
    const { contract, rfp, bid, side } = ctx;
    const draft = await this.deps.agreement.findDraft(contractId, tx);
    if (contract.status !== 'awaiting_pg_template') {
      const snapshot = await this.deps.signing.findSentDocument(contractId, tx);
      if (!snapshot || !('agreement' in snapshot)) return { ok: true, mode: 'legacy' };
      const sent = snapshot as AgreementSnapshot;
      return {
        ok: true,
        mode: 'agreement',
        editable: false,
        contractId,
        revision: draft?.revision ?? 0,
        rfpCode: rfp.code,
        fees: sent.feeRows as AgreementView['fees'],
        snapshot: sent,
        signers: sent.agreement.signers,
      };
    }
    if (contract.providerRef && !draft?.prepared) return { ok: true, mode: 'legacy' };
    if (contract.providerRef && draft?.prepared && side === 'pg') {
      const snapshot = draft.prepared as AgreementSnapshot;
      return {
        ok: true,
        mode: 'agreement',
        editable: false,
        contractId,
        revision: draft.revision,
        rfpCode: rfp.code,
        fees: snapshot.feeRows as AgreementView['fees'],
        snapshot,
        signers: snapshot.agreement.signers,
        stamp: 'recover',
      };
    }
    const rates = await this.deps.agreement.findRates(bid.pgWsId, tx);
    const fees = buildAgreementFees(
      {
        paymentFees: bid.paymentFees,
        customFees: bid.customFees,
        customMethods: rfp.customPaymentMethods,
      },
      rates?.rates ?? [],
    );
    const base = {
      ok: true as const,
      mode: 'agreement' as const,
      editable: side === 'pg' && !contract.providerRef,
      contractId,
      revision: 0,
      rfpCode: rfp.code,
      fees: fees.ok ? fees.rows : [],
      ...(!fees.ok ? { error: fees.error } : {}),
    };
    // The buyer never receives unsent party fields, revision or the preview token.
    if (side === 'buyer') return base;
    const [buyerWs, pgWs, buyerSigner, pgSigner] = await Promise.all([
      this.deps.workspace.findById(rfp.buyerWsId, tx),
      this.deps.workspace.findById(bid.pgWsId, tx),
      this.deps.user.findContactById(rfp.createdBy, tx),
      this.deps.user.findContactById(actor.userId, tx),
    ]);
    if (!buyerWs || !pgWs || !buyerSigner || !pgSigner)
      return { ok: false, error: 'CONTACT_NOT_FOUND' };
    const blank = { company: '', bizNo: '', address: '', representative: '' };
    const parties = draft?.parties ?? {
      buyer: {
        ...blank,
        company: buyerWs.name,
        bizNo: rfp.bizProfile?.bizNo ?? '',
      },
      pg: { ...blank, company: pgWs.name },
    };
    const signers = {
      buyer: {
        name: buyerSigner.name,
        email: buyerSigner.email,
        phone: buyerSigner.phone ?? undefined,
      },
      pg: {
        name: pgSigner.name,
        email: pgSigner.email,
        phone: pgSigner.phone ?? undefined,
      },
    };
    const snapshot: AgreementSnapshot = {
      _v: 1,
      doc: buildAgreementDocument(parties.buyer.company, parties.pg.company),
      parties,
      feeRows: base.fees,
      agreement: {
        version: AGREEMENT_VERSION,
        rateVersion: rates?.version ?? 0,
        bidId: bid.id,
        signers,
      },
    };
    const stamp = createHash('sha256')
      .update(
        JSON.stringify({
          contractId,
          revision: draft?.revision ?? 0,
          actor: { userId: actor.userId, workspaceId: actor.workspaceId },
          snapshot,
        }),
      )
      .digest('hex');
    return {
      ...base,
      revision: draft?.revision ?? 0,
      parties,
      signers,
      sendReadiness: {
        buyer: resolveSecurityMethod(buyerSigner.phone).enforced,
        pg: resolveSecurityMethod(pgSigner.phone).enforced,
      },
      stamp,
      snapshot,
    };
  }

  async save(
    contractId: string,
    actor: Actor,
    revision: number,
    input: unknown,
  ): Promise<ServiceResult<{ revision: number }>> {
    const ctx = await this.context(contractId, actor);
    if (!ctx || ctx.side !== 'pg') return { ok: false, error: 'FORBIDDEN' };
    const parties = AgreementDraftSchema.safeParse(input);
    if (!parties.success || !Number.isInteger(revision) || revision < 0)
      return { ok: false, error: 'INVALID_INPUT' };
    const next = await this.deps.agreement.saveDraft(contractId, revision, parties.data);
    return next === undefined
      ? { ok: false, error: 'AGREEMENT_CHANGED' }
      : { ok: true, revision: next };
  }

  /** claim → lock PG policy → compare preview → persist exact document → provider.
   * Admin takes the same PG lock. Edits take the signing row lock and reject the lease.
   * Once prepared, later policy updates apply only to the next contract. */
  async prepare(
    contractId: string,
    actor: Actor,
    expectedStamp: string,
    claimedAt: Date,
  ): Promise<ServiceResult<{ snapshot: AgreementSnapshot }>> {
    return this.deps.db.transaction(async (tx: Tx) => {
      const ctx = await this.context(contractId, actor, tx);
      if (!ctx || ctx.side !== 'pg') return { ok: false, error: 'FORBIDDEN' };
      await this.deps.agreement.lockPg(ctx.bid.pgWsId, tx);
      await this.deps.agreement.lockContract(contractId, tx);
      const lease = await this.deps.signing.findSendLease(contractId, tx);
      if (
        !lease ||
        lease.claimedAt.getTime() !== claimedAt.getTime() ||
        lease.holderUserId !== actor.userId ||
        claimedAt.getTime() <= Date.now() - EMBED_SEND_LEASE_MS
      )
        return { ok: false, error: 'AGREEMENT_BUSY' };
      const view = await this.load(contractId, actor, tx);
      if (!view.ok) return view;
      if (view.mode !== 'agreement' || !view.editable || view.stamp !== expectedStamp)
        return { ok: false, error: 'AGREEMENT_CHANGED' };
      if (view.error) return { ok: false, error: view.error };
      if (
        !view.revision ||
        !AgreementPartiesSchema.safeParse(view.parties).success ||
        !view.snapshot
      )
        return { ok: false, error: 'AGREEMENT_INCOMPLETE' };
      await this.deps.agreement.prepare(contractId, view.snapshot, tx);
      return { ok: true, snapshot: view.snapshot };
    });
  }
}

export const { get: getAgreementService } = defineAsyncSingleton(
  'agreement_service',
  'service',
  async () => {
    const [agreement, signing, rfp, bid, user, workspace, db] = await Promise.all([
      getAgreementRepo(),
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getDb(),
    ]);
    return new AgreementService({
      agreement,
      signing,
      rfp,
      bid,
      user,
      workspace,
      db,
    });
  },
);
