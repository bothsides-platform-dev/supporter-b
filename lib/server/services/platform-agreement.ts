import { createHash, randomUUID } from "node:crypto";
import { PLATFORM_SEAL, loadPlatformSeal } from "@/lib/server/signing/platform-seal";
export { PLATFORM_SEAL } from "@/lib/server/signing/platform-seal";
import { defineAsyncSingleton } from "@/lib/server/_singleton";
import {
  getAgreementRepo,
  getSigningContractRepo,
  getRfpRepo,
  getBidRepo,
  getUserRepo,
  getWorkspaceRepo,
  getAuditLogRepo,
  getDb,
} from "@/lib/server/repositories/factory";
import type { Tx } from "@/lib/server/repositories/types";
import { buildAgreementFees } from "@/lib/contract-doc/agreement";
import {
  buildPlatformAgreementDocument,
  platformAgreementParty,
  PLATFORM_AGREEMENT_VERSION,
} from "@/lib/contract-doc/platform-agreement";
import {
  PlatformAgreementDraftSchema,
  PlatformAgreementCompleteSchema,
  type PlatformAgreementSnapshot,
  type PlatformAgreementView,
} from "@/lib/types/platform-agreement";
import { renderContractPdf } from "@/lib/contract-doc/render-pdf";
import { collectDrawableText } from "@/lib/contract-doc/doc-text";
import { loadGlyphCoverage, missingGlyphs } from "@/lib/contract-doc/pdf-font";
import {
  getSnowSignClient,
  SnowSignError,
} from "@/lib/server/signing/snowsign-client";
import { uploadPdfBytes } from "@/lib/server/signing/upload-bytes";
import {
  reserveUploadSlot,
  bindUploadSlot,
  releaseUploadSlot,
  releaseUploadSlotByUploadId,
} from "@/lib/server/signing/upload-session-budget";
import { buildSignatureFieldsPayload } from "@/lib/signing/template-fields";
import { resolveSecurityMethod } from "@/lib/signing/security-method";
import { EMBED_SEND_LEASE_MS } from "@/lib/signing/embed-lease";
import { SigningSentCommit } from "./signing-sent-commit";
import {
  isDispatchedProviderStatus,
  mapProviderContractStatus,
} from "./signing-policy";
import type { Actor, ServiceResult } from "./types";

export async function renderPlatformAgreement(
  snapshot: PlatformAgreementSnapshot,
) {
  if (
    snapshot.seal.version !== PLATFORM_SEAL.version ||
    snapshot.seal.sha256 !== PLATFORM_SEAL.sha256
  )
    throw new Error("PLATFORM_SEAL_CHANGED");
  if (
    missingGlyphs(collectDrawableText(snapshot), await loadGlyphCoverage())
      .length
  )
    throw new Error("COMPOSE_UNSUPPORTED_CHARACTERS");
  const sealBytes = await loadPlatformSeal();
  return renderContractPdf(snapshot, { sealBytes });
}
async function dependencies() {
  const [agreement, signing, rfp, bid, user, workspace, audit, db] =
    await Promise.all([
      getAgreementRepo(),
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
      getDb(),
    ]);
  return {
    agreement,
    signing,
    rfp,
    bid,
    user,
    workspace,
    audit,
    db,
    client: getSnowSignClient(),
  };
}
export class PlatformAgreementService {
  constructor(
    private readonly deps: Awaited<ReturnType<typeof dependencies>>,
  ) {}
  private async context(id: string, actor: Actor, tx?: Tx) {
    const found = await this.deps.signing.findById(id, tx);
    if (found?.contract.kind !== "platform_buyer") return undefined;
    const rfp = await this.deps.rfp.findById(found.contract.rfpId, tx);
    if (!rfp?.awardedBidId || rfp.buyerWsId !== actor.workspaceId)
      return undefined;
    const bid = await this.deps.bid.findById(rfp.awardedBidId, tx);
    return bid ? { ...found, rfp, bid } : undefined;
  }
  async load(
    id: string,
    actor: Actor,
    tx?: Tx,
  ): Promise<PlatformAgreementView | { ok: false; error: string }> {
    const ctx = await this.context(id, actor, tx);
    if (!ctx) return { ok: false, error: "FORBIDDEN" };
    const draft = await this.deps.agreement.findPlatformDraft(id, tx);
    if (
      ctx.contract.providerRef ||
      ctx.contract.status !== "awaiting_pg_template"
    ) {
      if (!draft?.prepared) return { ok: false, error: "AGREEMENT_CHANGED" };
      return {
        ok: true,
        contractId: id,
        editable: false,
        revision: draft.revision,
        parties: draft.prepared.parties,
        signer: draft.prepared.agreement.signer,
        snapshot: draft.prepared,
        stamp: "recover",
        canSign: false,
      };
    }
    const [ws, pg, signer, rates] = await Promise.all([
      this.deps.workspace.findById(ctx.rfp.buyerWsId, tx),
      this.deps.workspace.findById(ctx.bid.pgWsId, tx),
      this.deps.user.findContactById(ctx.rfp.createdBy, tx),
      this.deps.agreement.findRates(ctx.bid.pgWsId, tx),
    ]);
    if (!ws || !pg || !signer) return { ok: false, error: "CONTACT_NOT_FOUND" };
    const parties = {
      buyer: draft?.parties.buyer ?? {
        company: ws.name,
        bizNo: ctx.rfp.bizProfile?.bizNo ?? "",
        address: "",
        representative: "",
      },
      platform: platformAgreementParty(),
    };
    const fees = buildAgreementFees(
      {
        paymentFees: ctx.bid.paymentFees,
        customFees: ctx.bid.customFees,
        customMethods: ctx.rfp.customPaymentMethods,
      },
      rates?.rates ?? [],
    );
    const contact = {
      name: signer.name,
      email: signer.email,
      phone: signer.phone ?? undefined,
    };
    const snapshot: PlatformAgreementSnapshot = {
      _v: 1,
      kind: "platform_buyer",
      parties,
      seal: PLATFORM_SEAL,
      doc: buildPlatformAgreementDocument(parties.buyer.company, pg.name),
      feeRows: fees.ok ? fees.rows : [],
      agreement: {
        version: PLATFORM_AGREEMENT_VERSION,
        rateVersion: rates?.version ?? 0,
        bidId: ctx.bid.id,
        pgWsId: pg.id,
        pgName: pg.name,
        signer: contact,
      },
    };
    const stamp = createHash("sha256")
      .update(
        JSON.stringify({ id, actor, revision: draft?.revision ?? 0, snapshot }),
      )
      .digest("hex");
    return {
      ok: true,
      contractId: id,
      editable: true,
      revision: draft?.revision ?? 0,
      parties,
      signer: contact,
      snapshot,
      stamp,
      canSign: resolveSecurityMethod(contact.phone).enforced,
      ...(!fees.ok ? { error: fees.error } : {}),
    };
  }
  async save(
    id: string,
    actor: Actor,
    revision: number,
    input: unknown,
  ): Promise<ServiceResult<{ revision: number }>> {
    if (!(await this.context(id, actor)))
      return { ok: false, error: "FORBIDDEN" };
    const parsed = PlatformAgreementDraftSchema.safeParse(input);
    if (!parsed.success || !Number.isInteger(revision) || revision < 0)
      return { ok: false, error: "INVALID_INPUT" };
    const next = await this.deps.agreement.savePlatformDraft(
      id,
      revision,
      parsed.data,
    );
    return next === undefined
      ? { ok: false, error: "AGREEMENT_CHANGED" }
      : { ok: true, revision: next };
  }
  async send(id: string, actor: Actor, stamp: string): Promise<ServiceResult> {
    const initial = await this.context(id, actor);
    if (!initial) return { ok: false, error: "FORBIDDEN" };
    if (initial.contract.status !== "awaiting_pg_template")
      return { ok: false, error: "ALREADY_SENT" };
    const now = new Date();
    if (
      !(await this.deps.signing.claimForSend(
        id,
        now,
        new Date(now.getTime() - EMBED_SEND_LEASE_MS),
        actor.userId,
      ))
    )
      return { ok: false, error: "AGREEMENT_BUSY" };
    const commit = new SigningSentCommit(
      this.deps.db,
      this.deps.signing,
      this.deps.audit,
      this.deps.workspace,
      this.deps.user,
    );
    try {
      const ctx = await this.context(id, actor);
      if (!ctx || ctx.contract.status !== "awaiting_pg_template")
        return { ok: false, error: "ALREADY_SENT" };
      if (ctx.contract.providerRef) {
        const ref = ctx.contract.providerRef;
        const draft = await this.deps.agreement.findPlatformDraft(id);
        if (!draft?.prepared) return { ok: false, error: "AGREEMENT_CHANGED" };
        const detail = await this.deps.client.getContract(ref);
        if (
          isDispatchedProviderStatus(detail.status) ||
          mapProviderContractStatus(detail.status) === "completed"
        ) {
          const result = await commit.bindObserved({
            active: ctx.contract,
            rfp: ctx.rfp,
            detail,
            providerContractId: ref,
            actor,
            source: "self_heal",
            pgWsId: ctx.bid.pgWsId,
          });
          if (!result.ok) return result;
          if (result.shouldFinalize) {
            const { getContractSigningService } =
              await import("./contract-signing");
            await (await getContractSigningService()).ensureFinalized(id);
          }
          return { ok: true };
        }
        const canceled = mapProviderContractStatus(detail.status) === "canceled";
        if (!canceled && detail.status.trim().toLowerCase() !== "draft")
          return { ok: false, error: "CONTRACT_CHANGED" };
        // Keep the recovery handle until cancellation is positively confirmed.
        // A delayed original send may have completed after this draft observation;
        // a failed/ambiguous cancel must never allow a second live contract.
        if (!canceled) await this.deps.client.cancel(ref, "미발송 초안 정리");
        const cleared = await this.deps.db.transaction(async (tx: Tx) => {
          await this.deps.agreement.lockContract(id, tx);
          const lease = await this.deps.signing.findSendLease(id, tx);
          if (lease?.claimedAt.getTime() !== now.getTime() || lease.holderUserId !== actor.userId)
            return false;
          return this.deps.signing.clearDraftRefIf(id, ref, tx);
        });
        if (!cleared) return { ok: false, error: "CONTRACT_BUSY" };
        return { ok: false, error: "AGREEMENT_CHANGED" };
      }
      const prepared = await this.deps.db.transaction(
        async (
          tx: Tx,
        ): Promise<ServiceResult<{ snapshot: PlatformAgreementSnapshot }>> => {
          await this.deps.agreement.lockPg(ctx.bid.pgWsId, tx);
          await this.deps.agreement.lockContract(id, tx);
          const lease = await this.deps.signing.findSendLease(id, tx);
          if (
            lease?.claimedAt.getTime() !== now.getTime() ||
            lease.holderUserId !== actor.userId ||
            now.getTime() <= Date.now() - EMBED_SEND_LEASE_MS
          )
            return { ok: false, error: "AGREEMENT_BUSY" };
          const view = await this.load(id, actor, tx);
          if (!view.ok) return view;
          if (!view.editable || view.stamp !== stamp)
            return { ok: false, error: "AGREEMENT_CHANGED" };
          if (view.error) return { ok: false, error: view.error };
          if (
            !view.revision ||
            !PlatformAgreementCompleteSchema.safeParse({
              buyer: view.parties.buyer,
            }).success
          )
            return { ok: false, error: "AGREEMENT_INCOMPLETE" };
          if (!view.canSign)
            return { ok: false, error: "BUYER_PHONE_REQUIRED" };
          await this.deps.agreement.preparePlatform(id, view.snapshot, tx);
          return { ok: true, snapshot: view.snapshot };
        },
      );
      if (!prepared.ok) return prepared;
      const { snapshot } = prepared;
      const pdf = await renderPlatformAgreement(snapshot);
      const slot = reserveUploadSlot(actor.workspaceId, pdf.bytes.byteLength);
      if (!slot.ok) return { ok: false, error: slot.error };
      let uploadId: string;
      try {
        const upload = await this.deps.client.createUploadSession({
          purpose: "contract_document",
          filename: `${ctx.rfp.code}-합의서.pdf`,
          contentType: "application/pdf",
          sizeBytes: pdf.bytes.byteLength,
        });
        bindUploadSlot(slot.slotId, upload.uploadId);
        await uploadPdfBytes(upload, pdf.bytes, `${ctx.rfp.code}-합의서.pdf`);
        uploadId = upload.uploadId;
      } catch (error) {
        releaseUploadSlot(slot.slotId);
        throw error;
      }
      const signer = snapshot.agreement.signer;
      const security = resolveSecurityMethod(signer.phone);
      if (!security.enforced)
        return { ok: false, error: "BUYER_PHONE_REQUIRED" };
      const created = await this.deps.client.createContract({
        title: `${ctx.rfp.title} 장기계약 부속합의서`,
        documentUploadId: uploadId,
        participants: [
          {
            role: "구매사",
            name: signer.name,
            email: signer.email,
            auth: { phone: security.phone },
          },
        ],
        signatureFields: buildSignatureFieldsPayload(pdf.fields),
        externalId: `sc:${id}`,
      });
      releaseUploadSlotByUploadId(uploadId);
      if (
        !(await this.deps.signing.bindDraftRef(
          id,
          { origin: "compose", providerRef: created.contractId },
          undefined,
          { claimedAt: now },
        ))
      ) {
        await this.deps.client.cancel(created.contractId, "중복 초안 정리");
        return { ok: false, error: "CONTRACT_BUSY" };
      }
      const sent = await this.deps.client.sendContract(created.contractId);
      await commit.confirmCreated({
        active: ctx.contract,
        rfp: ctx.rfp,
        actor,
        now,
        providerRef: created.contractId,
        sentAt: sent.sentAt ?? new Date().toISOString(),
        draft: null,
        participants: [
          {
            id: randomUUID(),
            contractId: id,
            userId: ctx.rfp.createdBy,
            role: "buyer",
            name: signer.name,
            email: signer.email,
            phone: security.phone,
            securityMethod: "easy_cert",
            status: "pending",
          },
        ],
        auditMetadata: {
          contractId: id,
          kind: "platform_buyer",
          agreementVersion: snapshot.agreement.version,
          sealVersion: snapshot.seal.version,
        },
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof SnowSignError ? error.code : "SEND_FAILED",
      };
    } finally {
      await this.deps.signing.releaseSendClaim(id, now);
    }
  }
}
export const { get: getPlatformAgreementService } = defineAsyncSingleton(
  "platform_agreement_service",
  "service",
  async () => new PlatformAgreementService(await dependencies()),
);
