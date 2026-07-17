// ContractService — 전자계약 발송~체결 라이프사이클. rfp.ts 의 구조를 미러한다:
// 단일 tx 안에서 상태 전이 + 이벤트 + 감사 + notify()(inapp row + email outbox),
// commit 후 emitAfterCommit + flushAfterCommit. 세션 경계는 액션 레이어에 있고
// 이 서비스는 해석된 Actor(userId + active workspaceId)만 받는다.
//
// PDF 결정성 계약(lib/server/contracts): compose* 는 주입된 now 로 시각을 못박아
// 같은 입력 → 같은 바이트 → 같은 SHA-256 을 낳는다. 완료본은 completedAt(=마지막
// 서명 시각)을 now 로 주입해 재현 가능한 무결성 지문을 남긴다.
import { randomUUID } from 'node:crypto';

import { composeBasePdf } from '@/lib/server/contracts/compose';
import { composeFinalPdf } from '@/lib/server/contracts/finalize';
import { validateTemplatePdf } from '@/lib/server/contracts/template-validate';
import { verifyStoredPdf } from '@/lib/server/contracts/verify';
import type { AuditEvent, AuditSigner } from '@/lib/server/contracts/pdf/audit-sheet';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { notify } from '@/lib/server/notifications/notify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { isUniqueViolation } from '@/lib/server/repositories/utils';
import { baseUrlFor } from '@/lib/server/env';
import { getStorage } from '@/lib/server/storage';
import { renderContractSent } from '@/lib/server/outbox/templates/contractSent';
import { renderContractSigned } from '@/lib/server/outbox/templates/contractSigned';
import { renderContractCompleted } from '@/lib/server/outbox/templates/contractCompleted';
import { renderContractDeclined } from '@/lib/server/outbox/templates/contractDeclined';
import { renderContractCanceled } from '@/lib/server/outbox/templates/contractCanceled';
import { renderContractExpired } from '@/lib/server/outbox/templates/contractExpired';
import { renderContractSignerReassigned } from '@/lib/server/outbox/templates/contractSignerReassigned';
import { formatDateTime } from '@/lib/utils/format';
import { CONTRACT_CONSENT_TEXT_VERSION } from '@/lib/types/contract-doc';
import type {
  ContractDoc,
  ContractDocEvent,
  ContractDocSigner,
  ContractParty,
  ContractPartiesV1,
  ContractSignatureMethod,
  ContractTermsSnapshotV1,
} from '@/lib/types/contract-doc';
import type {
  AuditLogRepo,
  BidRepo,
  BizProfileRepo,
  ContractDocRepo,
  ContractTemplateRepo,
  RfpRepo,
  Tx,
  WorkspaceRepo,
  UserRepo,
} from '@/lib/server/repositories/types';
import type { OutboxEvent } from '@/lib/server/outbox/types';
import type { Bid, MerchantTier } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import type { Notification } from '@/lib/types/notification';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

/** HTTP request context stamped on events / signatures for the audit trail. */
export type RequestMeta = { ip: string | null; userAgent: string | null };

export type SendContractInput = {
  rfpCode: string;
  templateId: string;
  title: string;
  parties: ContractPartiesV1;
  pgSignerUserId: string;
  expiresInDays: number;
};

// Internal sentinel — a createDoc unique-violation (active-sent race) unwinds
// the tx so the reserved sequence number rolls back, then maps to ACTIVE_DOC_EXISTS.
class ActiveDocExistsError extends Error {}

// A resolved notification target with the side that determines its CTA origin.
type Recip = { userId: string; email: string; side: ContractParty; workspaceId: string };

export class ContractService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly docRepo: ContractDocRepo,
    private readonly templateRepo: ContractTemplateRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
    private readonly bizProfileRepo: BizProfileRepo,
    private readonly auditRepo: AuditLogRepo,
  ) {}

  // ── send ─────────────────────────────────────────────────────────────────
  async send(
    input: SendContractInput,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ServiceResult<{ docId: string; code: string }>> {
    const now = new Date();
    const docId = randomUUID();

    // 1) award + PG ownership.
    const rfp = await this.rfpRepo.findByCode(input.rfpCode);
    if (!rfp || rfp.status !== 'awarded' || !rfp.awardedBidId) {
      return { ok: false, error: 'NOT_AWARDED' };
    }
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid) return { ok: false, error: 'NOT_AWARDED' };
    if (bid.pgWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN_PG' };

    // 2) template owned by this PG + backed by a ready PDF that validates.
    const template = await this.templateRepo.findById(input.templateId);
    if (!template || template.pgWsId !== actor.workspaceId || !template.attachment) {
      return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    }
    const templateBytes = await readStorageBytes(template.attachment.id);
    const validation = await validateTemplatePdf(templateBytes);
    if (!validation.ok) return { ok: false, error: 'TEMPLATE_PDF_INVALID' };

    // 3) no active (sent) doc already outstanding for this RFP.
    const existing = await this.docRepo.findLatestByRfp(rfp.id);
    if (existing && existing.status === 'sent') return { ok: false, error: 'ACTIVE_DOC_EXISTS' };

    // 4) signers: pg (designated) must be approved; buyer resolved with fallback.
    const pgMembership = await this.workspaceRepo.getMembership(input.pgSignerUserId, actor.workspaceId);
    if (!pgMembership || pgMembership.approvalStatus !== 'approved') {
      return { ok: false, error: 'INVALID_SIGNER' };
    }
    const buyer = await this.resolveBuyerSigner(rfp);
    if (!buyer) return { ok: false, error: 'NO_BUYER_SIGNER' };
    const buyerProfile = await this.userRepo.findProfileById(buyer.userId);
    if (!buyerProfile) return { ok: false, error: 'NO_BUYER_SIGNER' };
    const pgProfile = await this.userRepo.findProfileById(input.pgSignerUserId);
    if (!pgProfile) return { ok: false, error: 'INVALID_SIGNER' };

    const terms = await this.buildTerms(rfp, bid);
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
    const kstYymm = formatDateTime(now.toISOString(), 'Asia/Seoul', 'yyMM');
    const baseKey = `contract-docs/${docId}/base.pdf`;
    const storage = getStorage();

    const pendingEmits: Notification[] = [];
    let savedKey = false;

    let result: ServiceResult<{ docId: string; code: string }>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await this._db.transaction(async (tx: any) => {
        const seq = await this.docRepo.reserveNextCode(kstYymm, tx);
        const code = `CT-${kstYymm}-${String(seq).padStart(4, '0')}`;

        const { pdf, sha256 } = await composeBasePdf({
          templatePdf: templateBytes,
          docCode: code,
          now,
          title: input.title,
          parties: input.parties,
          terms,
        });
        await storage.save(baseKey, pdf, 'application/pdf');
        savedKey = true;

        try {
          await this.docRepo.createDoc(
            {
              id: docId,
              code,
              rfpId: rfp.id,
              bidId: bid.id,
              buyerWsId: rfp.buyerWsId,
              pgWsId: actor.workspaceId,
              templateId: template.id,
              status: 'sent',
              title: input.title,
              parties: input.parties,
              termsSnapshot: terms,
              basePdfKey: baseKey,
              basePdfSha256: sha256,
              basePdfSize: pdf.length,
              createdBy: actor.userId,
              expiresAt: expiresAt.toISOString(),
            },
            [
              { id: randomUUID(), party: 'buyer', userId: buyer.userId, name: buyerProfile.name, email: buyerProfile.email },
              { id: randomUUID(), party: 'pg', userId: input.pgSignerUserId, name: pgProfile.name, email: pgProfile.email },
            ],
            tx,
          );
        } catch (e) {
          if (isUniqueViolation(e)) throw new ActiveDocExistsError();
          throw e;
        }

        await this.docRepo.insertEvent(
          {
            id: randomUUID(),
            docId,
            type: 'sent',
            actorUserId: actor.userId,
            actorParty: 'pg',
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: buyer.fallback ? { buyerSignerFallback: true } : null,
          },
          tx,
        );
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: actor.workspaceId,
            action: 'contract.send',
            entityType: 'contract',
            entityId: code,
            metadata: { rfpCode: rfp.code, pgSignerUserId: input.pgSignerUserId },
          },
          tx,
        );

        const expiresLabel = formatDateTime(expiresAt.toISOString(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
        await this.fanout(
          tx,
          pendingEmits,
          docId,
          [{ userId: buyer.userId, email: buyerProfile.email, side: 'buyer', workspaceId: rfp.buyerWsId }],
          {
            type: 'contract.sent',
            event: 'contract.sent',
            title: `[${code}] 서명할 계약서가 도착했어요`,
            body: `${input.parties.pg.name}가 전자계약서를 보냈어요. 확인하고 서명해 주세요.`,
            subject: `[서포트비 · ${code}] 서명할 계약서가 도착했어요`,
            kind: 'sent',
            render: (ctaUrl) =>
              renderContractSent({
                code,
                title: input.title,
                pgWorkspaceName: input.parties.pg.name,
                expiresAtLabel: expiresLabel,
                ctaUrl,
              }),
          },
        );

        return { ok: true as const, docId, code };
      });
    } catch (e) {
      // Storage is not transactional — clean up the orphaned object best-effort.
      if (savedKey) await storage.delete(baseKey).catch(() => {});
      if (e instanceof ActiveDocExistsError) return { ok: false, error: 'ACTIVE_DOC_EXISTS' };
      throw e;
    }

    if (result.ok) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── sign ─────────────────────────────────────────────────────────────────
  async sign(
    docId: string,
    sig: { imagePng: Buffer; method: ContractSignatureMethod },
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ServiceResult<{ completed: boolean }>> {
    const now = new Date();
    const pendingEmits: Notification[] = [];
    let didEnqueue = false;
    let bothSigned = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const doc = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!doc) return { ok: false as const, error: 'NOT_FOUND' };

      if (await this.maybeExpire(tx, doc, now, pendingEmits)) {
        didEnqueue = true;
        return { ok: false as const, error: 'EXPIRED' };
      }
      if (doc.status !== 'sent') return { ok: false as const, error: 'INVALID_STATE' };

      const myParty = partyOf(doc, actor.workspaceId);
      if (!myParty) return { ok: false as const, error: 'FORBIDDEN_SIGNER' };

      const signers = await this.docRepo.getSigners(docId, tx);
      const mine = signers.find((s) => s.party === myParty)!;
      const other = signers.find((s) => s.party !== myParty)!;
      if (mine.userId !== actor.userId) return { ok: false as const, error: 'FORBIDDEN_SIGNER' };
      if (mine.signedAt) return { ok: false as const, error: 'ALREADY_SIGNED' };

      await this.docRepo.markSigned(
        mine.id,
        {
          consentAt: now.toISOString(),
          consentTextVersion: CONTRACT_CONSENT_TEXT_VERSION,
          signedAt: now.toISOString(),
          signatureImage: sig.imagePng,
          signatureMethod: sig.method,
          signIp: meta.ip,
          signUserAgent: meta.userAgent,
        },
        tx,
      );
      await this.docRepo.insertEvent(
        {
          id: randomUUID(),
          docId,
          type: 'signed',
          actorUserId: actor.userId,
          actorParty: myParty,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'contract.sign',
          entityType: 'contract',
          entityId: doc.code,
          metadata: { party: myParty },
        },
        tx,
      );

      bothSigned = !!other.signedAt;

      // Signed notification only while the counterparty is still pending — a
      // completing signature hands off to the completed notification instead.
      if (!bothSigned) {
        const signerName = mine.name;
        const recips = (await this.gatherAllParties(doc, signers, tx)).filter(
          (r) => r.userId !== actor.userId,
        );
        await this.fanout(tx, pendingEmits, docId, recips, {
          type: 'contract.signed',
          event: 'contract.signed',
          title: `[${doc.code}] 상대방이 서명했어요`,
          body: `${signerName}님이 계약서에 서명했어요.`,
          subject: `[서포트비 · ${doc.code}] 계약서에 서명이 추가됐어요`,
          kind: `signed:${myParty}`,
          render: (ctaUrl) =>
            renderContractSigned({ code: doc.code, title: doc.title, signerName, ctaUrl }),
        });
        didEnqueue = true;
      }
      return { ok: true as const };
    });

    if (!result.ok) {
      if (didEnqueue) {
        emitAfterCommit(pendingEmits);
        flushAfterCommit();
      }
      return result;
    }

    if (didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    if (bothSigned) {
      const fin = await this.ensureFinalized(docId);
      return { ok: true, completed: fin.ok ? fin.completed : false };
    }
    return { ok: true, completed: false };
  }

  // ── ensureFinalized (idempotent completion) ───────────────────────────────
  async ensureFinalized(docId: string): Promise<ServiceResult<{ completed: boolean }>> {
    const doc = await this.docRepo.findById(docId);
    if (!doc) return { ok: false, error: 'NOT_FOUND' };
    if (doc.status === 'completed') return { ok: true, completed: true };
    if (doc.status !== 'sent') return { ok: true, completed: false };

    const signers = await this.docRepo.getSigners(docId);
    const buyer = signers.find((s) => s.party === 'buyer');
    const pg = signers.find((s) => s.party === 'pg');
    if (!buyer || !pg || !buyer.signedAt || !pg.signedAt) return { ok: true, completed: false };

    const [buyerImg, pgImg] = await Promise.all([
      this.docRepo.getSignerImage(docId, 'buyer'),
      this.docRepo.getSignerImage(docId, 'pg'),
    ]);
    if (!buyerImg || !pgImg) return { ok: false, error: 'MISSING_SIGNATURE' };

    const events = await this.docRepo.listEvents(docId);
    const storage = getStorage();
    const basePdf = await readStorageBytes(doc.basePdfKey);

    // completedAt = the later of the two signatures — injected as `now` for a
    // deterministic final PDF (same signatures → same bytes → same SHA).
    const buyerAt = new Date(buyer.signedAt);
    const pgAt = new Date(pg.signedAt);
    const completedAt = buyerAt.getTime() >= pgAt.getTime() ? buyerAt : pgAt;
    const lastSigner = buyerAt.getTime() >= pgAt.getTime() ? buyer : pg;

    const auditSigners: AuditSigner[] = [buyer, pg].map((s) => ({
      party: s.party,
      name: s.name,
      email: s.email,
      signedAt: new Date(s.signedAt!),
      ip: s.signIp,
      method: s.signatureMethod as 'draw' | 'type',
      imagePng: s.party === 'buyer' ? buyerImg : pgImg,
      consentAt: new Date(s.consentAt!),
      consentTextVersion: s.consentTextVersion!,
    }));
    const auditEvents = await this.buildAuditEvents(events);

    const { pdf: finalPdf, sha256 } = await composeFinalPdf({
      basePdf,
      docCode: doc.code,
      now: completedAt,
      title: doc.title,
      baseSha256: doc.basePdfSha256,
      completedAt,
      signers: auditSigners,
      events: auditEvents,
    });
    const finalKey = `contract-docs/${docId}/final.pdf`;
    await storage.save(finalKey, finalPdf, 'application/pdf');

    const pendingEmits: Notification[] = [];
    let didEnqueue = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ completed: boolean }> = await this._db.transaction(async (tx: any) => {
      const fresh = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!fresh) return { ok: false as const, error: 'NOT_FOUND' };
      if (fresh.status === 'completed') return { ok: true as const, completed: true };
      if (fresh.status !== 'sent') return { ok: true as const, completed: false };

      const freshSigners = await this.docRepo.getSigners(docId, tx);
      const fb = freshSigners.find((s) => s.party === 'buyer');
      const fp = freshSigners.find((s) => s.party === 'pg');
      if (!fb?.signedAt || !fp?.signedAt) return { ok: true as const, completed: false };

      const done = await this.docRepo.complete(
        docId,
        { finalPdfKey: finalKey, finalPdfSha256: sha256, finalPdfSize: finalPdf.length, completedAt: completedAt.toISOString() },
        tx,
      );
      if (!done) return { ok: true as const, completed: true }; // lost a completion race — success

      await this.docRepo.insertEvent(
        {
          id: randomUUID(),
          docId,
          type: 'completed',
          actorUserId: null,
          actorParty: null,
          metadata: { finalPdfSha256: sha256 },
        },
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: lastSigner.userId,
          actorWorkspaceId: lastSigner.party === 'buyer' ? doc.buyerWsId : doc.pgWsId,
          action: 'contract.complete',
          entityType: 'contract',
          entityId: doc.code,
          metadata: { finalPdfSha256: sha256 },
        },
        tx,
      );

      const recips = await this.gatherAllParties(doc, freshSigners, tx);
      await this.fanout(tx, pendingEmits, docId, recips, {
        type: 'contract.completed',
        event: 'contract.completed',
        title: `[${doc.code}] 계약이 체결됐어요`,
        body: '양측 서명이 완료돼 계약이 체결됐어요.',
        subject: `[서포트비 · ${doc.code}] 계약이 체결됐어요`,
        kind: 'completed',
        render: (ctaUrl) => renderContractCompleted({ code: doc.code, title: doc.title, ctaUrl }),
      });
      didEnqueue = true;
      return { ok: true as const, completed: true };
    });

    if (result.ok && didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── recordView ─────────────────────────────────────────────────────────────
  async recordView(docId: string, actor: Actor, meta: RequestMeta): Promise<ServiceResult> {
    const doc = await this.docRepo.findById(docId);
    if (!doc) return { ok: false, error: 'NOT_FOUND' };
    const party = partyOf(doc, actor.workspaceId);
    if (!party) return { ok: false, error: 'FORBIDDEN' };
    const signers = await this.docRepo.getSigners(docId);
    const mine = signers.find((s) => s.party === party);
    // Only the designated signer's own first view is recorded (idempotent).
    if (!mine || mine.userId !== actor.userId) return { ok: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.docRepo.insertViewedEventIfAbsent(
        docId,
        party,
        { actorUserId: actor.userId, ip: meta.ip, userAgent: meta.userAgent },
        tx,
      );
    });
    return { ok: true };
  }

  // ── decline (buyer) ────────────────────────────────────────────────────────
  async decline(
    docId: string,
    reason: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ServiceResult> {
    const now = new Date();
    const pendingEmits: Notification[] = [];
    let didEnqueue = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const doc = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!doc) return { ok: false as const, error: 'NOT_FOUND' };
      if (await this.maybeExpire(tx, doc, now, pendingEmits)) {
        didEnqueue = true;
        return { ok: false as const, error: 'EXPIRED' };
      }
      if (doc.status !== 'sent') return { ok: false as const, error: 'INVALID_STATE' };
      if (actor.workspaceId !== doc.buyerWsId) return { ok: false as const, error: 'FORBIDDEN' };

      const signers = await this.docRepo.getSigners(docId, tx);
      const buyerSigner = signers.find((s) => s.party === 'buyer')!;
      const authorized =
        buyerSigner.userId === actor.userId ||
        (await this.isApprovedAdmin(actor.userId, doc.buyerWsId, tx));
      if (!authorized) return { ok: false as const, error: 'FORBIDDEN' };

      await this.docRepo.decline(docId, { reason, declinedAt: now.toISOString() }, tx);
      await this.docRepo.insertEvent(
        { id: randomUUID(), docId, type: 'declined', actorUserId: actor.userId, actorParty: 'buyer', ip: meta.ip, userAgent: meta.userAgent, metadata: { reason } },
        tx,
      );
      await this.auditRepo.insert(
        { actorUserId: actor.userId, actorWorkspaceId: actor.workspaceId, action: 'contract.decline', entityType: 'contract', entityId: doc.code, metadata: { reason } },
        tx,
      );

      const recips = (await this.gatherAllParties(doc, signers, tx)).filter((r) => r.side === 'pg');
      await this.fanout(tx, pendingEmits, docId, recips, {
        type: 'contract.declined',
        event: 'contract.declined',
        title: `[${doc.code}] 계약이 반려됐어요`,
        body: '구매사가 계약을 반려했어요.',
        subject: `[서포트비 · ${doc.code}] 계약이 반려됐어요`,
        kind: 'declined',
        render: (ctaUrl) => renderContractDeclined({ code: doc.code, title: doc.title, reason, ctaUrl }),
      });
      didEnqueue = true;
      return { ok: true as const };
    });

    if (didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── cancel (PG) ──────────────────────────────────────────────────────────
  async cancel(docId: string, actor: Actor, meta: RequestMeta): Promise<ServiceResult> {
    const now = new Date();
    const pendingEmits: Notification[] = [];
    let didEnqueue = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const doc = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!doc) return { ok: false as const, error: 'NOT_FOUND' };
      if (await this.maybeExpire(tx, doc, now, pendingEmits)) {
        didEnqueue = true;
        return { ok: false as const, error: 'EXPIRED' };
      }
      if (doc.status !== 'sent') return { ok: false as const, error: 'INVALID_STATE' };
      if (actor.workspaceId !== doc.pgWsId) return { ok: false as const, error: 'FORBIDDEN' };

      const authorized =
        doc.createdBy === actor.userId ||
        (await this.isApprovedAdmin(actor.userId, doc.pgWsId, tx));
      if (!authorized) return { ok: false as const, error: 'FORBIDDEN' };

      await this.docRepo.cancel(docId, now.toISOString(), tx);
      await this.docRepo.insertEvent(
        { id: randomUUID(), docId, type: 'canceled', actorUserId: actor.userId, actorParty: 'pg', ip: meta.ip, userAgent: meta.userAgent },
        tx,
      );
      await this.auditRepo.insert(
        { actorUserId: actor.userId, actorWorkspaceId: actor.workspaceId, action: 'contract.cancel', entityType: 'contract', entityId: doc.code, metadata: null },
        tx,
      );

      const signers = await this.docRepo.getSigners(docId, tx);
      const buyerSigner = signers.find((s) => s.party === 'buyer')!;
      await this.fanout(
        tx,
        pendingEmits,
        docId,
        [{ userId: buyerSigner.userId, email: buyerSigner.email, side: 'buyer', workspaceId: doc.buyerWsId }],
        {
          type: 'contract.canceled',
          event: 'contract.canceled',
          title: `[${doc.code}] 계약이 회수됐어요`,
          body: `${doc.parties.pg.name}가 계약을 회수했어요.`,
          subject: `[서포트비 · ${doc.code}] 계약이 회수됐어요`,
          kind: 'canceled',
          render: (ctaUrl) =>
            renderContractCanceled({ code: doc.code, title: doc.title, pgWorkspaceName: doc.parties.pg.name, ctaUrl }),
        },
      );
      didEnqueue = true;
      return { ok: true as const };
    });

    if (didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── reassignBuyerSigner (buyer admin) ──────────────────────────────────────
  async reassignBuyerSigner(
    docId: string,
    newUserId: string,
    actor: Actor,
    meta: RequestMeta,
  ): Promise<ServiceResult> {
    const now = new Date();
    const pendingEmits: Notification[] = [];
    let didEnqueue = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult = await this._db.transaction(async (tx: any) => {
      const doc = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!doc) return { ok: false as const, error: 'NOT_FOUND' };
      if (await this.maybeExpire(tx, doc, now, pendingEmits)) {
        didEnqueue = true;
        return { ok: false as const, error: 'EXPIRED' };
      }
      if (doc.status !== 'sent') return { ok: false as const, error: 'INVALID_STATE' };
      if (actor.workspaceId !== doc.buyerWsId) return { ok: false as const, error: 'FORBIDDEN' };
      if (!(await this.isApprovedAdmin(actor.userId, doc.buyerWsId, tx))) {
        return { ok: false as const, error: 'FORBIDDEN' };
      }

      const signers = await this.docRepo.getSigners(docId, tx);
      const buyerSigner = signers.find((s) => s.party === 'buyer')!;
      if (buyerSigner.signedAt) return { ok: false as const, error: 'SIGNER_ALREADY_SIGNED' };

      const membership = await this.workspaceRepo.getMembership(newUserId, doc.buyerWsId, tx);
      if (!membership || membership.approvalStatus !== 'approved') {
        return { ok: false as const, error: 'INVALID_SIGNER' };
      }
      const profile = await this.userRepo.findProfileById(newUserId, tx);
      if (!profile) return { ok: false as const, error: 'INVALID_SIGNER' };

      await this.docRepo.reassignBuyerSigner(
        docId,
        { userId: newUserId, name: profile.name, email: profile.email, reassignedBy: actor.userId, reassignedAt: now.toISOString() },
        tx,
      );
      await this.docRepo.insertEvent(
        { id: randomUUID(), docId, type: 'signer_reassigned', actorUserId: actor.userId, actorParty: 'buyer', ip: meta.ip, userAgent: meta.userAgent, metadata: { newUserId } },
        tx,
      );
      await this.auditRepo.insert(
        { actorUserId: actor.userId, actorWorkspaceId: actor.workspaceId, action: 'contract.reassign_signer', entityType: 'contract', entityId: doc.code, metadata: { newUserId } },
        tx,
      );

      await this.fanout(
        tx,
        pendingEmits,
        docId,
        [{ userId: newUserId, email: profile.email, side: 'buyer', workspaceId: doc.buyerWsId }],
        {
          type: 'contract.signer_reassigned',
          event: 'contract.signer_reassigned',
          title: `[${doc.code}] 서명할 계약서가 배정됐어요`,
          body: '계약서 서명자로 지정됐어요. 확인하고 서명해 주세요.',
          subject: `[서포트비 · ${doc.code}] 서명할 계약서가 배정됐어요`,
          kind: 'reassigned',
          render: (ctaUrl) => renderContractSignerReassigned({ code: doc.code, title: doc.title, ctaUrl }),
        },
      );
      didEnqueue = true;
      return { ok: true as const };
    });

    if (didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── verify ─────────────────────────────────────────────────────────────────
  async verify(docId: string, actor: Actor): Promise<ServiceResult<{ intact: boolean; computed: string }>> {
    const doc = await this.docRepo.findById(docId);
    if (!doc) return { ok: false, error: 'NOT_FOUND' };
    if (actor.workspaceId !== doc.buyerWsId && actor.workspaceId !== doc.pgWsId) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    const storage = getStorage();
    const useFinal = doc.status === 'completed' && !!doc.finalPdfKey && !!doc.finalPdfSha256;
    const key = useFinal ? doc.finalPdfKey! : doc.basePdfKey;
    const sha = useFinal ? doc.finalPdfSha256! : doc.basePdfSha256;
    const { intact, computed } = await verifyStoredPdf(storage, key, sha);
    return { ok: true, intact, computed };
  }

  // ── expireIfDue (lazy, public entry) ──────────────────────────────────────
  async expireIfDue(docId: string): Promise<ServiceResult<{ expired: boolean }>> {
    const now = new Date();
    const pendingEmits: Notification[] = [];
    let didEnqueue = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ServiceResult<{ expired: boolean }> = await this._db.transaction(async (tx: any) => {
      const doc = await this.docRepo.findByIdForUpdate(docId, tx);
      if (!doc) return { ok: true as const, expired: false };
      if (doc.status !== 'sent') return { ok: true as const, expired: false };
      if (new Date(doc.expiresAt).getTime() >= now.getTime()) return { ok: true as const, expired: false };
      await this.expireInTx(tx, doc, now, pendingEmits);
      didEnqueue = true;
      return { ok: true as const, expired: true };
    });

    if (didEnqueue) {
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
    }
    return result;
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async resolveBuyerSigner(rfp: RFP): Promise<{ userId: string; fallback: boolean } | null> {
    const created = await this.workspaceRepo.getMembership(rfp.createdBy, rfp.buyerWsId);
    if (created && created.approvalStatus === 'approved') {
      return { userId: rfp.createdBy, fallback: false };
    }
    // Fallback: earliest-joined approved admin (deterministic joinedAt, userId tiebreak).
    const roster = await this.workspaceRepo.teamRoster(rfp.buyerWsId);
    const recipients = await this.workspaceRepo.memberRecipientsBatch([rfp.buyerWsId]);
    const adminIds = new Set(recipients.filter((r) => r.role === 'admin').map((r) => r.userId));
    const adminRoster = roster
      .filter((m) => adminIds.has(m.userId))
      .sort((a, b) => {
        if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt ? -1 : 1;
        return a.userId < b.userId ? -1 : 1;
      });
    if (adminRoster.length === 0) return null;
    return { userId: adminRoster[0].userId, fallback: true };
  }

  private async buildTerms(rfp: RFP, bid: Bid): Promise<ContractTermsSnapshotV1> {
    // Prefer the RFP's frozen biz-profile snapshot grade; fall back to the
    // workspace's current profile grade; else null.
    let buyerTier: MerchantTier | null = rfp.bizProfile?.grade ?? null;
    if (!buyerTier) {
      const wsBizId = await this.workspaceRepo.getBizProfileId(rfp.buyerWsId);
      if (wsBizId) {
        const wsBiz = await this.bizProfileRepo.findById(wsBizId);
        buyerTier = wsBiz?.grade ?? null;
      }
    }
    return {
      _v: 1,
      rfpCode: rfp.code,
      rfpTitle: rfp.title,
      settleCycle: bid.settleCycle,
      settleLimit: bid.settleLimit,
      guaranteeInsurance: bid.guaranteeInsurance,
      paymentFees: bid.paymentFees,
      customFees: bid.customFees,
      customPaymentMethods: rfp.customPaymentMethods,
      buyerTier,
    };
  }

  private async isApprovedAdmin(userId: string, wsId: string, tx: Tx): Promise<boolean> {
    const m = await this.workspaceRepo.getMembership(userId, wsId, tx);
    return !!m && m.role === 'admin' && m.approvalStatus === 'approved';
  }

  // both signers + the PG sender (if distinct), tagged by CTA side.
  private async gatherAllParties(
    doc: ContractDoc,
    signers: ContractDocSigner[],
    tx: Tx,
  ): Promise<Recip[]> {
    const buyer = signers.find((s) => s.party === 'buyer')!;
    const pg = signers.find((s) => s.party === 'pg')!;
    const recips: Recip[] = [
      { userId: buyer.userId, email: buyer.email, side: 'buyer', workspaceId: doc.buyerWsId },
      { userId: pg.userId, email: pg.email, side: 'pg', workspaceId: doc.pgWsId },
    ];
    if (doc.createdBy !== buyer.userId && doc.createdBy !== pg.userId) {
      const sender = await this.userRepo.findProfileById(doc.createdBy, tx);
      if (sender) recips.push({ userId: sender.id, email: sender.email, side: 'pg', workspaceId: doc.pgWsId });
    }
    return recips;
  }

  private async buildAuditEvents(events: ContractDocEvent[]): Promise<AuditEvent[]> {
    const ids = [...new Set(events.map((e) => e.actorUserId).filter((x): x is string => !!x))];
    const nameById = new Map<string, string>();
    for (const id of ids) {
      const p = await this.userRepo.findProfileById(id);
      if (p) nameById.set(id, p.name);
    }
    return events.map((e) => ({
      type: e.type,
      at: new Date(e.createdAt),
      actorName: e.actorUserId ? (nameById.get(e.actorUserId) ?? null) : null,
      ip: e.ip,
    }));
  }

  private async maybeExpire(
    tx: Tx,
    doc: ContractDoc,
    now: Date,
    pendingEmits: Notification[],
  ): Promise<boolean> {
    if (doc.status === 'sent' && new Date(doc.expiresAt).getTime() < now.getTime()) {
      await this.expireInTx(tx, doc, now, pendingEmits);
      return true;
    }
    return false;
  }

  private async expireInTx(
    tx: Tx,
    doc: ContractDoc,
    _now: Date,
    pendingEmits: Notification[],
  ): Promise<void> {
    await this.docRepo.expire(doc.id, tx);
    // System transition — no audit row (audit records user actions only); the
    // event timeline carries the expiry.
    await this.docRepo.insertEvent(
      { id: randomUUID(), docId: doc.id, type: 'expired', actorUserId: null, actorParty: null, ip: null, userAgent: null },
      tx,
    );
    const signers = await this.docRepo.getSigners(doc.id, tx);
    const recips = await this.gatherAllParties(doc, signers, tx);
    await this.fanout(tx, pendingEmits, doc.id, recips, {
      type: 'contract.expired',
      event: 'contract.expired',
      title: `[${doc.code}] 계약 서명 기한이 지났어요`,
      body: '서명 기한이 지나 계약이 만료됐어요.',
      subject: `[서포트비 · ${doc.code}] 계약 서명 기한이 지났어요`,
      kind: 'expired',
      render: (ctaUrl) => renderContractExpired({ code: doc.code, title: doc.title, ctaUrl }),
    });
  }

  // Group recipients by CTA side (buyer/pg origin differs), dedupe by userId,
  // and fan out inapp + email per side. Returned inapp notifications are pushed
  // to pendingEmits for the caller's post-commit emit.
  private async fanout(
    tx: Tx,
    pendingEmits: Notification[],
    docId: string,
    recipients: Recip[],
    spec: {
      type: string;
      event: OutboxEvent;
      title: string;
      body: string;
      subject: string;
      kind: string;
      render: (ctaUrl: string) => Promise<string>;
    },
  ): Promise<void> {
    const seen = new Set<string>();
    const deduped = recipients.filter((r) => {
      if (seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });
    const linkUrl = `/contracts/${docId}`;
    for (const side of ['buyer', 'pg'] as const) {
      const group = deduped.filter((r) => r.side === side);
      if (group.length === 0) continue;
      const ctaUrl = `${baseUrlFor(side)}/contracts/${docId}`;
      const html = await spec.render(ctaUrl);
      const created = await notify(tx, {
        recipients: group.map((r) => ({ userId: r.userId, workspaceId: r.workspaceId, email: r.email })),
        channels: ['inapp', 'email'],
        type: spec.type,
        title: spec.title,
        body: spec.body,
        linkUrl,
        email: {
          event: spec.event,
          subject: spec.subject,
          html,
          dedupeKey: (email) => `contract:${docId}:${spec.kind}:${email}`,
        },
      });
      pendingEmits.push(...created);
    }
  }
}

// Drain a storage object's stream into one Buffer (reading only the first chunk
// silently truncates a large PDF and yields a wrong hash).
async function readStorageBytes(key: string): Promise<Buffer> {
  const { stream } = await getStorage().read(key);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function partyOf(doc: ContractDoc, workspaceId: string): ContractParty | null {
  if (workspaceId === doc.buyerWsId) return 'buyer';
  if (workspaceId === doc.pgWsId) return 'pg';
  return null;
}

// ─── Factory (rfp.ts single-global pattern) ──────────────────────────────────

declare global {
  var __bidit_contract_service__: ContractService | undefined;
}

export async function getContractService(): Promise<ContractService> {
  if (!globalThis.__bidit_contract_service__) {
    const [
      { db },
      {
        getContractDocRepo,
        getContractTemplateRepo,
        getRfpRepo,
        getBidRepo,
        getWorkspaceRepo,
        getUserRepo,
        getBizProfileRepo,
        getAuditLogRepo,
      },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [docRepo, templateRepo, rfpRepo, bidRepo, wsRepo, userRepo, bizRepo, auditRepo] =
      await Promise.all([
        getContractDocRepo(),
        getContractTemplateRepo(),
        getRfpRepo(),
        getBidRepo(),
        getWorkspaceRepo(),
        getUserRepo(),
        getBizProfileRepo(),
        getAuditLogRepo(),
      ]);

    globalThis.__bidit_contract_service__ = new ContractService(
      db,
      docRepo,
      templateRepo,
      rfpRepo,
      bidRepo,
      wsRepo,
      userRepo,
      bizRepo,
      auditRepo,
    );
  }
  return globalThis.__bidit_contract_service__!;
}

export function __resetContractServiceForTest(): void {
  globalThis.__bidit_contract_service__ = undefined;
}

export function __setContractServiceForTest(service: ContractService): void {
  globalThis.__bidit_contract_service__ = service;
}
