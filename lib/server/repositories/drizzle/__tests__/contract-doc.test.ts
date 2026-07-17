// DrizzleContractDocRepository — 전자계약 문서/서명자/이벤트.
// 핵심 불변식:
//  - RFP당 활성(status='sent') 문서는 최대 1개 (partial unique index)
//  - 서명자는 문서당 정확히 2행(buyer/pg) — signature_image(bytea)는 도메인
//    타입에 싣지 않는다(getSignerImage 전용 조회로만 접근)
//  - complete/decline/cancel/expire 는 모두 `WHERE status='sent'` 가드 —
//    이미 종결된 문서에는 no-op(false)

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { contractDocEvents, contractDocSigners, contractDocs } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { ContractDoc } from '@/lib/types/contract-doc';
import type { NewContractDocInput } from '../../types';
import { DrizzleContractDocRepository } from '../contract-doc';
import {
  seedBid,
  seedBuyerWorkspace,
  seedInvitation,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyerUser = await seedUser(db, { email: 'buyer@x.com', name: '구매담당' });
  const pgUser = await seedUser(db, { email: 'pg@x.com', name: 'PG담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  const pgWs = await seedPgWorkspace(db, 'PG사');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });
  const invitation = await seedInvitation(db, { rfpId: rfp.id, pgWsId: pgWs.id });
  const bid = await seedBid(db, {
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    invitationId: invitation.id,
    submittedBy: pgUser.id,
  });
  const repo = new DrizzleContractDocRepository(db);
  return { db, buyerUser, pgUser, buyerWs, pgWs, rfp, bid, repo };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function buildDocInput(ctx: Ctx, overrides?: Partial<NewContractDocInput>): NewContractDocInput {
  return {
    id: randomUUID(),
    code: `C-2607-${Math.floor(1000 + Math.random() * 8999)}`,
    rfpId: ctx.rfp.id,
    bidId: ctx.bid.id,
    buyerWsId: ctx.buyerWs.id,
    pgWsId: ctx.pgWs.id,
    templateId: null,
    status: 'sent',
    title: '전자계약서',
    parties: {
      _v: 1,
      buyer: { name: '구매사', repName: '대표', bizNo: null },
      pg: { name: 'PG사', repName: '대표', bizNo: null },
    },
    termsSnapshot: {
      _v: 1,
      rfpCode: ctx.rfp.code,
      rfpTitle: 'RFP',
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      customFees: {},
      customPaymentMethods: [],
      buyerTier: null,
    },
    basePdfKey: 'contracts/base/x.pdf',
    basePdfSha256: 'a'.repeat(64),
    basePdfSize: 12345,
    createdBy: ctx.buyerUser.id,
    expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

function buildSigners(ctx: Ctx) {
  return [
    { id: randomUUID(), party: 'buyer' as const, userId: ctx.buyerUser.id, name: '구매담당', email: 'buyer@x.com' },
    { id: randomUUID(), party: 'pg' as const, userId: ctx.pgUser.id, name: 'PG담당', email: 'pg@x.com' },
  ];
}

describe('DrizzleContractDocRepository.reserveNextCode', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('같은 연월 호출마다 순번이 증가한다', async () => {
    expect(await ctx.repo.reserveNextCode('2607', ctx.db)).toBe(1);
    expect(await ctx.repo.reserveNextCode('2607', ctx.db)).toBe(2);
    expect(await ctx.repo.reserveNextCode('2607', ctx.db)).toBe(3);
  });

  it('연월이 다르면 독립적으로 카운트한다', async () => {
    expect(await ctx.repo.reserveNextCode('2607', ctx.db)).toBe(1);
    expect(await ctx.repo.reserveNextCode('2608', ctx.db)).toBe(1);
    expect(await ctx.repo.reserveNextCode('2607', ctx.db)).toBe(2);
  });
});

describe('DrizzleContractDocRepository.createDoc', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('문서 1행과 서명자(buyer+pg) 2행을 함께 생성한다', async () => {
    const input = buildDocInput(ctx);
    const signers = buildSigners(ctx);

    await ctx.repo.createDoc(input, signers, ctx.db);

    const doc = await ctx.repo.findById(input.id);
    expect(doc).toBeDefined();
    expect(doc!.title).toBe(input.title);
    expect(doc!.status).toBe('sent');
    expect(doc!.code).toBe(input.code);
    expect(doc!.parties).toEqual(input.parties);
    expect(doc!.termsSnapshot).toEqual(input.termsSnapshot);

    const savedSigners = await ctx.repo.getSigners(input.id);
    expect(savedSigners).toHaveLength(2);
    expect(savedSigners.map((s) => s.party).sort()).toEqual(['buyer', 'pg']);
  });
});

describe('DrizzleContractDocRepository.findLatestByRfp', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('가장 최근 문서를 sentAt desc 기준으로 반환한다', async () => {
    const first = buildDocInput(ctx);
    await ctx.repo.createDoc(first, buildSigners(ctx), ctx.db);
    // 활성 unique 를 피하려면 첫 문서를 반려해야 두 번째 sent 문서를 만들 수 있다.
    await ctx.repo.decline(first.id, { reason: '조건 재협의', declinedAt: new Date().toISOString() }, ctx.db);

    const second = buildDocInput(ctx);
    await ctx.repo.createDoc(second, buildSigners(ctx), ctx.db);

    await ctx.db
      .update(contractDocs)
      .set({ sentAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(contractDocs.id, first.id));
    await ctx.db
      .update(contractDocs)
      .set({ sentAt: new Date('2026-02-01T00:00:00Z') })
      .where(eq(contractDocs.id, second.id));

    const latest = await ctx.repo.findLatestByRfp(ctx.rfp.id);
    expect(latest!.id).toBe(second.id);
  });

  it('문서가 없으면 undefined 를 반환한다', async () => {
    expect(await ctx.repo.findLatestByRfp(ctx.rfp.id)).toBeUndefined();
  });
});

describe('DrizzleContractDocRepository.listForWorkspace', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('구매사/PG 워크스페이스 양쪽에서 조회되며 상대 워크스페이스명을 포함한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    const buyerList = await ctx.repo.listForWorkspace(ctx.buyerWs.id);
    expect(buyerList).toHaveLength(1);
    expect(buyerList[0].doc.id).toBe(input.id);
    expect(buyerList[0].buyerWsName).toBe('구매사');
    expect(buyerList[0].pgWsName).toBe('PG사');
    expect(buyerList[0].signers).toHaveLength(2);

    const pgList = await ctx.repo.listForWorkspace(ctx.pgWs.id);
    expect(pgList).toHaveLength(1);
    expect(pgList[0].doc.id).toBe(input.id);
    expect(pgList[0].buyerWsName).toBe('구매사');
    expect(pgList[0].pgWsName).toBe('PG사');
  });

  it('관련 없는 워크스페이스에는 나타나지 않는다', async () => {
    const otherWs = await seedBuyerWorkspace(ctx.db, { name: '무관 구매사' });
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    expect(await ctx.repo.listForWorkspace(otherWs.id)).toEqual([]);
  });
});

describe('DrizzleContractDocRepository.markSigned', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('서명 완료 필드를 반영하고, 이미지는 getSignerImage 로만 조회된다', async () => {
    const input = buildDocInput(ctx);
    const signers = buildSigners(ctx);
    await ctx.repo.createDoc(input, signers, ctx.db);
    const buyerSignerId = signers.find((s) => s.party === 'buyer')!.id;

    await ctx.repo.markSigned(
      buyerSignerId,
      {
        consentAt: new Date().toISOString(),
        consentTextVersion: 'v1',
        signedAt: new Date().toISOString(),
        signatureImage: Buffer.from('png-bytes'),
        signatureMethod: 'draw',
        signIp: '127.0.0.1',
        signUserAgent: 'vitest',
      },
      ctx.db,
    );

    const signed = (await ctx.repo.getSigners(input.id)).find((s) => s.id === buyerSignerId)!;
    expect(signed.signedAt).not.toBeNull();
    expect(signed.consentTextVersion).toBe('v1');
    expect(signed.signatureMethod).toBe('draw');
    expect((signed as Record<string, unknown>).signatureImage).toBeUndefined();

    const image = await ctx.repo.getSignerImage(input.id, 'buyer');
    expect(image?.toString()).toBe('png-bytes');
  });

  it('DB CHECK: signed_at 과 signature_image 는 함께 있거나 함께 없어야 한다', async () => {
    const input = buildDocInput(ctx);
    const signers = buildSigners(ctx);
    await ctx.repo.createDoc(input, signers, ctx.db);
    const buyerSignerId = signers.find((s) => s.party === 'buyer')!.id;

    await expect(
      ctx.db
        .update(contractDocSigners)
        .set({ signedAt: new Date() })
        .where(eq(contractDocSigners.id, buyerSignerId)),
    ).rejects.toThrow();
  });
});

describe('DrizzleContractDocRepository — status transitions', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('complete 는 sent 상태에서 성공하고 최종 PDF 필드를 반영한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    const ok = await ctx.repo.complete(
      input.id,
      {
        finalPdfKey: 'contracts/final/x.pdf',
        finalPdfSha256: 'b'.repeat(64),
        finalPdfSize: 999,
        completedAt: new Date().toISOString(),
      },
      ctx.db,
    );

    expect(ok).toBe(true);
    const doc = (await ctx.repo.findById(input.id)) as ContractDoc;
    expect(doc.status).toBe('completed');
    expect(doc.finalPdfKey).toBe('contracts/final/x.pdf');
    expect(doc.finalPdfSha256).toBe('b'.repeat(64));
    expect(doc.finalPdfSize).toBe(999);
  });

  it('이미 종결된 문서에 complete 를 다시 호출하면 false 를 반환하고 상태를 바꾸지 않는다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);
    await ctx.repo.cancel(input.id, new Date().toISOString(), ctx.db);

    const ok = await ctx.repo.complete(
      input.id,
      { finalPdfKey: 'x', finalPdfSha256: 'c'.repeat(64), finalPdfSize: 1, completedAt: new Date().toISOString() },
      ctx.db,
    );

    expect(ok).toBe(false);
    expect((await ctx.repo.findById(input.id))!.status).toBe('canceled');
  });

  it('decline 은 사유와 함께 반려 처리한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    const ok = await ctx.repo.decline(
      input.id,
      { reason: '조건 상이', declinedAt: new Date().toISOString() },
      ctx.db,
    );

    expect(ok).toBe(true);
    const doc = await ctx.repo.findById(input.id);
    expect(doc!.status).toBe('declined');
    expect(doc!.declineReason).toBe('조건 상이');
  });

  it('cancel 은 sent 상태를 회수 처리한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    expect(await ctx.repo.cancel(input.id, new Date().toISOString(), ctx.db)).toBe(true);
    expect((await ctx.repo.findById(input.id))!.status).toBe('canceled');
  });

  it('expire 는 sent 상태를 만료 처리한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    expect(await ctx.repo.expire(input.id, ctx.db)).toBe(true);
    expect((await ctx.repo.findById(input.id))!.status).toBe('expired');
  });

  it('decline/cancel/expire 도 이미 종결된 문서엔 false 를 반환한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);
    await ctx.repo.expire(input.id, ctx.db);

    expect(await ctx.repo.decline(input.id, { reason: 'x', declinedAt: new Date().toISOString() }, ctx.db)).toBe(
      false,
    );
    expect(await ctx.repo.cancel(input.id, new Date().toISOString(), ctx.db)).toBe(false);
    expect((await ctx.repo.findById(input.id))!.status).toBe('expired');
  });
});

describe('DrizzleContractDocRepository — active-rfp partial unique', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('같은 RFP 에 두 번째 sent 문서를 만들면 unique violation 이 발생한다', async () => {
    const first = buildDocInput(ctx);
    await ctx.repo.createDoc(first, buildSigners(ctx), ctx.db);

    const second = buildDocInput(ctx);
    await expect(ctx.repo.createDoc(second, buildSigners(ctx), ctx.db)).rejects.toThrow();
  });

  it('반려 후에는 같은 RFP 에 새 sent 문서를 만들 수 있다', async () => {
    const first = buildDocInput(ctx);
    await ctx.repo.createDoc(first, buildSigners(ctx), ctx.db);
    await ctx.repo.decline(first.id, { reason: 'x', declinedAt: new Date().toISOString() }, ctx.db);

    const second = buildDocInput(ctx);
    await expect(ctx.repo.createDoc(second, buildSigners(ctx), ctx.db)).resolves.toBeUndefined();
    expect((await ctx.repo.findById(second.id))!.status).toBe('sent');
  });
});

describe('DrizzleContractDocRepository.reassignBuyerSigner', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('구매사측 서명자 정보를 교체하고 재지정 메타를 남긴다', async () => {
    const input = buildDocInput(ctx);
    const signers = buildSigners(ctx);
    await ctx.repo.createDoc(input, signers, ctx.db);
    const newBuyerUser = await seedUser(ctx.db, { email: 'new-buyer@x.com', name: '새 담당자' });

    await ctx.repo.reassignBuyerSigner(
      input.id,
      {
        userId: newBuyerUser.id,
        name: '새 담당자',
        email: 'new-buyer@x.com',
        reassignedBy: ctx.buyerUser.id,
        reassignedAt: new Date().toISOString(),
      },
      ctx.db,
    );

    const buyerSigner = (await ctx.repo.getSigners(input.id)).find((s) => s.party === 'buyer')!;
    expect(buyerSigner.userId).toBe(newBuyerUser.id);
    expect(buyerSigner.name).toBe('새 담당자');
    expect(buyerSigner.email).toBe('new-buyer@x.com');
    expect(buyerSigner.reassignedBy).toBe(ctx.buyerUser.id);
    expect(buyerSigner.reassignedAt).not.toBeNull();

    // pg 서명자는 영향받지 않는다.
    const pgSigner = (await ctx.repo.getSigners(input.id)).find((s) => s.party === 'pg')!;
    expect(pgSigner.userId).toBe(ctx.pgUser.id);
  });
});

describe('DrizzleContractDocRepository.insertViewedEventIfAbsent', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('처음 호출은 true, 같은 party 재호출은 false(멱등)', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    const first = await ctx.repo.insertViewedEventIfAbsent(
      input.id,
      'buyer',
      { actorUserId: ctx.buyerUser.id, ip: '127.0.0.1', userAgent: 'vitest' },
      ctx.db,
    );
    const second = await ctx.repo.insertViewedEventIfAbsent(
      input.id,
      'buyer',
      { actorUserId: ctx.buyerUser.id, ip: '127.0.0.1', userAgent: 'vitest' },
      ctx.db,
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    const events = await ctx.repo.listEvents(input.id);
    expect(events.filter((e) => e.type === 'viewed' && e.actorParty === 'buyer')).toHaveLength(1);
  });

  it('다른 party 는 독립적으로 기록된다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    await ctx.repo.insertViewedEventIfAbsent(
      input.id,
      'buyer',
      { actorUserId: ctx.buyerUser.id, ip: null, userAgent: null },
      ctx.db,
    );
    await ctx.repo.insertViewedEventIfAbsent(
      input.id,
      'pg',
      { actorUserId: ctx.pgUser.id, ip: null, userAgent: null },
      ctx.db,
    );

    const events = await ctx.repo.listEvents(input.id);
    expect(events.filter((e) => e.type === 'viewed')).toHaveLength(2);
  });
});

describe('DrizzleContractDocRepository.insertEvent / listEvents', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('생성 순서(오래된 → 최신)로 정렬된다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    const sentEventId = randomUUID();
    const viewedEventId = randomUUID();
    await ctx.repo.insertEvent(
      { id: sentEventId, docId: input.id, type: 'sent', actorUserId: ctx.buyerUser.id, actorParty: 'buyer' },
      ctx.db,
    );
    await ctx.repo.insertEvent(
      { id: viewedEventId, docId: input.id, type: 'viewed', actorUserId: ctx.pgUser.id, actorParty: 'pg' },
      ctx.db,
    );
    await ctx.db
      .update(contractDocEvents)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(contractDocEvents.id, sentEventId));
    await ctx.db
      .update(contractDocEvents)
      .set({ createdAt: new Date('2026-01-02T00:00:00Z') })
      .where(eq(contractDocEvents.id, viewedEventId));

    const events = await ctx.repo.listEvents(input.id);
    expect(events.map((e) => e.id)).toEqual([sentEventId, viewedEventId]);
    expect(events[0].actorParty).toBe('buyer');
    expect(events[1].metadata).toBeNull();
  });
});

describe('DrizzleContractDocRepository.findByIdForUpdate', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('tx 안에서 FOR UPDATE 로 행을 반환한다', async () => {
    const input = buildDocInput(ctx);
    await ctx.repo.createDoc(input, buildSigners(ctx), ctx.db);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await ctx.db.transaction((tx: any) => ctx.repo.findByIdForUpdate(input.id, tx));

    expect(found).toBeDefined();
    expect(found!.id).toBe(input.id);
  });

  it('없는 id 는 undefined 를 반환한다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await ctx.db.transaction((tx: any) => ctx.repo.findByIdForUpdate(randomUUID(), tx));
    expect(found).toBeUndefined();
  });
});
