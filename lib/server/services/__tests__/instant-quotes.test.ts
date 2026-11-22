import '@/lib/server/signing/__tests__/_platform-seal-fixture';
import {
  GET as openConfirmation,
  POST as submitConfirmation,
} from '@/app/contact-confirm/instant/[id]/[step]/route';
import {
  __setSnowSignClientForTest,
  type SnowSignClient,
} from '@/lib/server/signing/snowsign-client';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, expect, it, vi } from 'vitest';
import {
  setupServerTestEnv,
  teardownServerTestEnv,
} from '@/lib/server/__tests__/_harness';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedMembership,
  seedBizProfile,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  guestRfpDrafts,
  pgAgreementRates,
  pgRecommendationGroups,
  pgMatchingPolicies,
  instantPgChannels,
  instantPolicies,
  instantAttempts,
  instantRequests,
  outboxEntries,
  users,
  workspaces,
  signingContracts,
  contractArchives,
  bids,
  rfps,
  guestRfpRequests,
  guestQuoteCalls,
} from '@/lib/db/schema';
import { __setNtsClientForTest } from '@/lib/integrations/nts';
import { getPlatformAgreementService } from '../platform-agreement';
import { guestSecretHash } from '../guest-drafts';
import {
  confirmInstant,
  previewInstant,
  buyerUpdate,
  loadInstant,
} from '../instant-quotes';
import {
  pgReply,
  pgProof,
  prepareInstantMail,
  runInstantFollowups,
} from '../instant-quote-mail';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
import { emptyMatchingFees } from '@/lib/rfp/pg-matching';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import {
  assembleTerms,
  conditionLines,
  estimatedSaving,
  feeRows,
  instantConsentVersion,
  instantVolumeEligible,
  type InstantInput,
  type InstantPolicy,
} from '@/lib/rfp/instant-quote';
import type { OutboxEntry } from '@/lib/server/outbox/types';
vi.mock('@/lib/server/signing/upload-bytes', () => ({
  uploadPdfBytes: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/notifications/operator-signing', () => ({
  notifySigningOperator: vi.fn(),
}));
const rates = MERCHANT_TIERS.map((t) => ({ key: 'card:' + t, rate: 0.014 }));
const policy: InstantPolicy = {
  fees: [
    ...MERCHANT_TIERS.map((t) => ({ key: 'card:' + t, rate: 0.012 })),
    { key: 'virtual_account', rate: 0 },
  ],
  terms: {
    insurance: { kind: 'none' },
    limit: { kind: 'fixed', won: 50000000 },
    cycle: { days: 3, unit: 'business' },
    signupFee: { kind: 'fixed', won: 0 },
  },
  direct: {
    insurance: { kind: 'fixed', won: 20000000 },
    cycle: { days: 7, unit: 'business' },
  },
  review: {
    cashConvertible: false,
    prices: [],
    sales: [],
    maxDeliveryDays: null,
  },
  validityDays: 10,
  retryDays: 20,
  responseDays: 30,
  ackDays: 1,
  applicationDays: 3,
  resultDays: 7,
};
const standards = [...rates, { key: 'virtual_account', rate: 250 }];
const screen = {
  cashConvertible: false,
  maximumPrice: 'under_100k',
  salesMethods: ['none'],
  deliveryDays: 2,
};
const secret = 'browser-proof-test',
  business = { bizNo: '1248100998', website: 'https://example.com' };
async function fixture() {
  vi.stubEnv('NEXT_PUBLIC_PG_INSTANT_QUOTE_ENABLED', 'true');
  vi.stubEnv('AUTH_SECRET', 'instant-fixture-secret');
  vi.stubEnv('ADMIN_NOTIFY_EMAIL', 'ops@example.test');
  const db = await setupServerTestEnv({ nts: true });
  const creator = await seedUser(db, { phone: '01012345678' }),
    biz = await seedBizProfile(db, { bizNo: business.bizNo }),
    buyer = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, creator.id));
  await db
    .update(workspaces)
    .set({ status: 'pending' })
    .where(eq(workspaces.id, buyer.id));
  await seedMembership(db, buyer.id, creator.id, 'admin');
  const pgs = [
      await seedPgWorkspace(db, '나래결제'),
      await seedPgWorkspace(db, '바다결제'),
    ],
    group = randomUUID(),
    key = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: group, name: '의류' });
  await db.insert(pgMatchingPolicies).values({
    groupId: group,
    policy: {
      risk: 'white',
      candidates: pgs.map((p) => ({
        pgWorkspaceId: p.id,
        reason: '의류업종',
        feesByTier: emptyMatchingFees(),
        feeNote: '',
      })),
    },
  });
  for (const [n, pg] of pgs.entries()) {
    await db.insert(instantPgChannels).values({
      pgId: pg.id,
      enabled: true,
      recipient: 'pg' + n + '@example.test',
      signupUrl: 'https://pg' + n + '.example.test/signup',
    });
    await db
      .insert(pgAgreementRates)
      .values({ pgWsId: pg.id, rates: standards });
    await db
      .insert(instantPolicies)
      .values({ pgId: pg.id, groupId: group, policy, version: 1 });
  }
  const data = {
    business,
    groupId: group,
    customIndustry: '',
    products: '가방',
    contractType: 'new',
    expectedVolume: '10m',
    methods: ['card'],
    currentPgs: [],
  } satisfies InstantInput;
  await db.insert(guestRfpDrafts).values({
    id: key,
    secretHash: guestSecretHash(secret),
    expiresAt: new Date(Date.now() + 86400000),
    answers: {
      version: 1,
      data: {
        websiteUrl: business.website,
        mainProducts: '가방',
        industryMode: 'registered',
        industryGroupId: group,
        contractType: 'new',
        expectedVolume: '10m',
        requiredPaymentMethods: ['card'],
      },
      quoteContext: {
        ...newQuoteContext(),
        bizNo: business.bizNo,
        confirmedWebsite: business.website,
        confirmed: ['business-number'],
      },
    },
  });
  const actor = { userId: creator.id, workspaceId: buyer.id };
  const input = { key, input: data, screen: {} };
  const offer = (await previewInstant(input, secret)).offers[0];
  const confirmation = {
    ...input,
    screen,
    stamp: offer.stamp,
    expires: offer.expires,
    pgId: pgs[0].id,
    agree: true,
    share: true,
    consentVersion: instantConsentVersion,
  };
  return {
    db,
    actor,
    creator,
    pgs,
    offer,
    input,
    confirmation,
    key,
    group,
    data,
  };
}
afterEach(() => {
  teardownServerTestEnv();
  __setSnowSignClientForTest(undefined);
  vi.unstubAllEnvs();
});
it('실적과 예상 구간 경계, 모든 등급의 표준과 금액 단위를 지킨다', () => {
  expect(
    instantVolumeEligible({
      contractType: 'renewal',
      monthlyAvgPgVolume: '49999999',
    }),
  ).toBe(true);
  for (const volume of ['50000000', '', '-1', 'abc'])
    expect(
      instantVolumeEligible({
        contractType: 'renewal',
        monthlyAvgPgVolume: volume,
      }),
    ).toBe(false);
  for (const band of ['under10m', '10m', '30m'] as const)
    expect(
      instantVolumeEligible({ contractType: 'new', expectedVolume: band }),
    ).toBe(true);
  for (const band of [undefined, '50m', '100m'] as const)
    expect(
      instantVolumeEligible({ contractType: 'new', expectedVolume: band }),
    ).toBe(false);
  expect(
    assembleTerms('a', '가', 1, policy, 1, standards.slice(1)),
  ).toBeUndefined();
  expect(
    assembleTerms('a', '가', 1, policy, 1, [
      { key: 'card:sole', rate: 0 },
      ...standards.slice(1),
    ]),
  ).toBeUndefined();
  const terms = assembleTerms('a', '가', 1, policy, 1, standards)!;
  const input: InstantInput = {
    business,
    groupId: null,
    customIndustry: '의류',
    products: '가방',
    contractType: 'new',
    expectedVolume: '10m',
    methods: ['card'],
    currentPgs: [],
  };
  expect(feeRows(terms)[0]).toMatchObject({
    label: '카드 영세 가맹점',
    value: '1.20%',
    standard: '1.40%',
  });
  expect(feeRows(terms).at(-1)?.value).toBe('0원/건');
  expect(estimatedSaving(input, terms, 'sole')).toBe(
    '월 20,000원 이상 60,000원 미만 절감 예상',
  );
  expect(
    estimatedSaving({ ...input, methods: ['virtual_account'] }, terms, 'sole'),
  ).toBeUndefined();
  expect(conditionLines(terms, input).flat().join(' ')).toContain(
    '4영업일 빠름',
  );
  expect(conditionLines(terms, input).flat().join(' ')).toContain(
    '가입금액 20,000,000원 감소',
  );
  expect(
    conditionLines({ ...terms, policy: { ...policy, direct: {} } }, input)[0],
  ).toEqual(['보증보험 가입금액', '가입 면제']);
});
it('미리보기 소유권·휴폐업·판본 변경·예약과 심사 예외에서 인계를 보류한다', async () => {
  const f = await fixture();
  expect(f.offer.tier).toBeNull();
  await expect(previewInstant(f.input, 'wrong')).rejects.toThrow();
  await expect(
    previewInstant(
      { ...f.input, input: { ...f.data, expectedVolume: '30m' } },
      secret,
    ),
  ).rejects.toThrow(/초안/);
  await f.db.update(instantPolicies).set({
    policy: {
      ...policy,
      review: { ...policy.review, cashConvertible: true },
    },
  });
  expect(await previewInstant(f.input, secret)).toMatchObject({
    offers: [],
    questions: ['cashConvertible'],
  });
  expect(
    await previewInstant(
      { ...f.input, screen: { cashConvertible: true } },
      secret,
    ),
  ).toMatchObject({ offers: [] });
  await f.db.update(instantPolicies).set({ policy, version: 2 });
  await expect(confirmInstant(f.confirmation, f.actor, secret)).rejects.toThrow(
    /조건이 바뀌/,
  );
  expect(await f.db.select().from(instantRequests)).toHaveLength(0);
  __setNtsClientForTest({
    lookup: async () => ({ valid: true, status: 'closed' }),
  });
  await expect(confirmInstant(f.confirmation, f.actor, secret)).rejects.toThrow(
    /정상 영업/,
  );
  __setNtsClientForTest({
    lookup: async () => {
      throw Error('timeout');
    },
  });
  await expect(confirmInstant(f.confirmation, f.actor, secret)).rejects.toThrow(
    /정상 영업/,
  );
  await f.db
    .update(users)
    .set({ emailVerified: false })
    .where(eq(users.id, f.actor.userId));
  await expect(confirmInstant(f.confirmation, f.actor, secret)).rejects.toThrow(
    /이메일/,
  );
  await f.db.insert(guestRfpRequests).values({
    draftId: f.key,
    revision: 1,
    pgId: f.pgs[0].id,
    days: 5,
    confirmedAt: new Date(),
    pgName: 'PG',
    status: 'unbound',
  });
  await expect(previewInstant(f.input, secret)).rejects.toThrow(/예약/);
  expect(await f.db.select().from(outboxEntries)).toHaveLength(0);
});
it('개업일 조회 결과를 기준으로 표시 등급을 결정한다', async () => {
  const f = await fixture(),
    now = new Date();
  const businessResult = {
    status: 'complete' as const,
    suggestions: [],
    needsConfirmation: [],
    business: { bizNo: business.bizNo, age: 'new' as const },
  };
  await f.db.insert(guestQuoteCalls).values({
    draftId: f.key,
    kind: 'business',
    inputHash: 'test',
    result: businessResult,
    createdAt: now,
    expiresAt: new Date(+now + 86400000),
  });
  expect((await previewInstant(f.input, secret)).offers[0].tier).toBe('sole');
  await f.db.update(guestQuoteCalls).set({
    result: {
      ...businessResult,
      business: { ...businessResult.business, age: 'established' },
    },
  });
  expect((await previewInstant(f.input, secret)).offers[0].tier).toBeNull();
  expect(
    (
      await previewInstant(
        { ...f.input, input: { ...f.data, annualRevenue: 3e9 } },
        secret,
      )
    ).offers[0].tier,
  ).toBe('sme3');
});
it('한 회차를 고정하고 수신처별 확인·거절 후 재신청·가입과 합의서를 독립 처리한다', async () => {
  const f = await fixture();
  const [first, repeat] = await Promise.all([
    confirmInstant(f.confirmation, f.actor, secret),
    confirmInstant(f.confirmation, f.actor, secret),
  ]);
  expect(repeat).toEqual(first);
  const a = (await loadInstant(f.db, first.id))!.a;
  expect(await f.db.select().from(outboxEntries)).toHaveLength(2);
  const mail = async (role: string) =>
    prepareInstantMail({
      event: 'pg.instant_quote',
      to: role === 'pg' ? a.recipient : a.applicant.email,
      dedupeKey: 'instant:' + a.id + ':' + role + ':issued',
    } as OutboxEntry);
  expect((await mail('pg'))?.html).toContain(business.bizNo);
  expect((await mail('buyer'))?.html).toContain(a.code);
  expect((await mail('buyer'))?.html).not.toContain('/contact-confirm/');
  expect((await mail('pg'))?.html).not.toContain('바다결제');
  expect((await buyerUpdate(a.id, f.actor, 'visit')).url).toBe(
    a.signupUrl + '?quote=' + a.code,
  );
  expect((await loadInstant(f.db, a.id))!.a.appliedAt).toBeNull();
  expect(await pgReply(a.id, 'receipt', pgProof(a, 'application'), {})).toBe(
    false,
  );
  await f.db
    .update(instantPgChannels)
    .set({ revision: 2 })
    .where(eq(instantPgChannels.pgId, a.pgId));
  expect(await mail('pg')).toBeNull();
  expect(await pgReply(a.id, 'receipt', pgProof(a, 'receipt'), {})).toBe(false);
  await f.db
    .update(instantPgChannels)
    .set({ revision: 1 })
    .where(eq(instantPgChannels.pgId, a.pgId));
  const receiptUrl =
    'https://example.com/contact-confirm/instant/' + a.id + '/receipt';
  const context = { params: Promise.resolve({ id: a.id, step: 'receipt' }) };
  const opened = await openConfirmation(new Request(receiptUrl), context);
  expect(opened.headers.get('referrer-policy')).toBe('no-referrer');
  expect(await opened.text()).not.toContain(a.code);
  expect((await loadInstant(f.db, a.id))!.a.ackAt).toBeNull();
  const acknowledged = await submitConfirmation(
    new Request(receiptUrl, {
      method: 'POST',
      body: new URLSearchParams({ token: pgProof(a, 'receipt') }),
    }),
    context,
  );
  expect(acknowledged.status).toBe(200);
  expect((await loadInstant(f.db, a.id))!.a.ackAt).not.toBeNull();
  expect(await pgReply(a.id, 'receipt', pgProof(a, 'receipt'), {})).toBe(true);
  expect(await pgReply(a.id, 'receipt', pgProof(a, 'receipt'), {})).toBe(true);
  expect(
    await pgReply(a.id, 'application', pgProof(a, 'application'), {
      code: a.code,
      bizNo: '0000000000',
    }),
  ).toBe(false);
  expect(
    await pgReply(a.id, 'application', pgProof(a, 'application'), {
      code: a.code,
      bizNo: business.bizNo,
    }),
  ).toBe(true);
  expect(
    await pgReply(a.id, 'result', pgProof(a, 'result'), {
      decision: 'declined',
    }),
  ).toBe(true);
  const next = { ...f.input, previous: a.id },
    options = await previewInstant(next, undefined, f.actor);
  expect(options.offers.map((o) => o.terms.pgId)).toEqual([f.pgs[1].id]);
  const o = options.offers[0];
  const { id } = await confirmInstant(
    {
      ...f.confirmation,
      previous: a.id,
      pgId: o.terms.pgId,
      stamp: o.stamp,
      expires: o.expires,
    },
    f.actor,
  );
  expect(await pgReply(a.id, 'receipt', pgProof(a, 'receipt'), {})).toBe(false);
  expect(await mail('pg')).toBeNull();
  await buyerUpdate(id, f.actor, 'enrolled');
  await expect(buyerUpdate(id, f.actor, 'agreement')).rejects.toThrow(/승인/);
  await expect(buyerUpdate(id, f.actor, 'match')).rejects.toThrow(/등급/);
  await f.db
    .update(workspaces)
    .set({ status: 'active' })
    .where(eq(workspaces.id, f.actor.workspaceId));
  await Promise.all([
    buyerUpdate(id, f.actor, 'agreement'),
    buyerUpdate(id, f.actor, 'agreement'),
  ]);
  const contracts = await f.db.select().from(signingContracts);
  expect(contracts).toHaveLength(1);
  expect(contracts[0]).toMatchObject({
    kind: 'platform_buyer',
    rfpId: null,
    instantAttemptId: id,
    status: 'awaiting_pg_template',
  });
  expect(await f.db.select().from(bids)).toHaveLength(0);
  expect(await f.db.select().from(rfps)).toHaveLength(0);
  await f.db.update(pgAgreementRates).set({ version: 2, rates: [] });
  vi.stubEnv('NEXT_PUBLIC_PG_INSTANT_QUOTE_ENABLED', 'false');
  const send = vi.fn(async () => ({ contractId: 'instant-signature' }));
  __setSnowSignClientForTest({
    createUploadSession: async () => ({
      uploadId: 'fixture',
      uploadUrl: 'https://example.com',
      expiresAt: new Date().toISOString(),
    }),
    createContract: async () => ({ contractId: 'instant-signature' }),
    sendContract: send,
  } as unknown as SnowSignClient);
  const signingService = await getPlatformAgreementService();
  const agreement = await signingService.load(contracts[0].id, f.actor);
  expect(agreement).toMatchObject({
    ok: true,
    snapshot: {
      feeRows: expect.arrayContaining([
        expect.objectContaining({
          label: '카드 영세 가맹점',
          value: '1.20%',
          standard: '1.40%',
        }),
      ]),
      agreement: { rateVersion: 1, instantQuote: { id } },
    },
  });
  const active = (await loadInstant(f.db, id))!.a;
  await pgReply(id, 'application', pgProof(active, 'application'), {
    code: active.code,
    bizNo: business.bizNo,
  });
  expect(
    await pgReply(id, 'result', pgProof(active, 'result'), {
      decision: 'approved',
      tier: 'sme1',
    }),
  ).toBe(true);
  await buyerUpdate(id, f.actor, 'differ', '카드 1.4%를 적용받았어요');
  expect((await loadInstant(f.db, id))!.a).toMatchObject({
    tier: 'sme1',
    differs: true,
    reported: '카드 1.4%를 적용받았어요',
  });
  expect(send).not.toHaveBeenCalled();
  expect(
    await signingService.save(contracts[0].id, f.actor, 0, {
      buyer: {
        company: '구매사',
        bizNo: business.bizNo,
        address: '서울시 강남구 테헤란로 123',
        representative: '김대표',
      },
    }),
  ).toMatchObject({ ok: true });
  const final = await signingService.load(contracts[0].id, f.actor);
  if (!final.ok || !final.stamp) throw Error('합의서 준비 실패');
  expect(
    await signingService.send(contracts[0].id, f.actor, final.stamp),
  ).toMatchObject({ ok: true });
  expect(send).toHaveBeenCalledTimes(1);
  await f.db
    .update(signingContracts)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(signingContracts.id, contracts[0].id));
  const { getContractArchiveRepo } =
    await import('@/lib/server/repositories/factory');
  expect(
    await (
      await getContractArchiveRepo()
    ).findCompletedContractsMissingArchive(10),
  ).toContain(contracts[0].id);
  const { getContractArchiveService } = await import('../contract-archive');
  expect(
    await (
      await getContractArchiveService()
    ).createPendingForContract(contracts[0].id),
  ).toMatchObject({ ok: true });
  expect(await f.db.select().from(contractArchives)).toEqual([
    expect.objectContaining({
      workspaceId: f.actor.workspaceId,
      rfpCode: active.code,
      kind: 'platform_buyer',
    }),
  ]);
  expect(await signingService.load(contracts[0].id, f.actor)).toMatchObject({
    ok: true,
    editable: false,
    snapshot: {
      feeRows: final.snapshot.feeRows,
      agreement: { instantQuote: { id }, rateVersion: 1 },
    },
  });
});
it('미확인 단계만 재안내하고 만료한 회신을 거부한다', async () => {
  const f = await fixture(),
    { id } = await confirmInstant(f.confirmation, f.actor, secret);
  const a = (await loadInstant(f.db, id))!.a;
  await runInstantFollowups(new Date(+a.resultDue + 1000));
  await runInstantFollowups(new Date(+a.resultDue + 2000));
  expect(await f.db.select().from(outboxEntries)).toHaveLength(6);
  vi.spyOn(Date, 'now').mockReturnValue(+a.validUntil + 365 * 86400000);
  try {
    await expect(
      confirmInstant(
        { ...f.confirmation, stamp: '0'.repeat(43) },
        f.actor,
        secret,
      ),
    ).rejects.toThrow();
  } finally {
    vi.restoreAllMocks();
  }
  const expired = new Date(0);
  await f.db.update(instantAttempts).set({
    consentAt: expired,
    validUntil: expired,
    ackDue: expired,
    applyDue: expired,
    resultDue: expired,
  });
  const updated = (await loadInstant(f.db, id))!.a;
  expect(await pgReply(id, 'receipt', pgProof(updated, 'receipt'), {})).toBe(
    false,
  );
});
