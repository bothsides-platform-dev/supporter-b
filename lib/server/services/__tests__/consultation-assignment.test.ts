import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedBusinessCalendar, validBusinessDeadline } from '@/lib/server/__tests__/_business-calendar';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  pgRecommendationGroups,
  pgMatchingPolicies,
  pgAssignmentPolicies,
  consultationCases,
  consultationQuestions,
  consultationEvidence,
  consultationEvents,
  rfps,
  users,
  alimtalkOutbox,
  workspaceMembers,
} from '@/lib/db/schema';
import {
  getAlimtalkRepo,
  getConsultationRepo,
  getOutboxRepo,
  getPgMatchingRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { getRfpService } from '../rfp';
import { getBidService } from '../bid';
import { getPgMatchingService } from '../pg-matching';
import { getConversationReadState } from '@/lib/chat/read-state/server';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { loadConversationThread } from '@/lib/server/actions/chat/conversationLoaders';
import { GET, POST } from '@/app/contact-confirm/[id]/route';
import { publishChatEvent } from '@/lib/server/realtime/centrifugo';
import { reportContact, answerContact } from '../consultation-contact';
import { prepareConsultationMail, questionToken } from '../consultation-notices';
import { runConsultationDeadlines } from '../consultation-deadlines';
import { assignmentSize, CONTACT_CONSENT_VERSION } from '@/lib/rfp/assignment';
import type { ParsedCreateRfpInput } from '@/lib/rfp/intake/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/server/outbox/post-commit', () => ({ flushAfterCommit: vi.fn() }));
vi.mock('@/lib/server/notifications/dispatch', async (orig) => ({
  ...(await orig<object>()),
  emitAfterCommit: vi.fn(),
}));
vi.mock('@/lib/server/realtime/centrifugo', async (orig) => ({
  ...(await orig<object>()),
  publishChatEvent: vi.fn(),
}));
vi.mock('@/lib/server/actions/_session', () => ({
  requireActiveWorkspace: async () => ({ ok: true, ...viewer }),
}));
type Person = { userId: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
let db: PgliteDB,
  pg: Person,
  buyer: Person,
  peer: Person,
  viewer: Person,
  groupId: string,
  input: ParsedCreateRfpInput;
async function member(ws: string, type: Person['workspaceType'], name: string) {
  const u = await seedUser(db, { name, email: name + '@example.test', phone: '01000001234' });
  await seedMembership(db, ws, u.id, 'admin');
  return { userId: u.id, workspaceId: ws, workspaceType: type };
}
beforeEach(async () => {
  vi.stubEnv('NEXT_PUBLIC_PG_ASSIGNMENT_ENABLED', 'true');
  vi.stubEnv('ADMIN_NOTIFY_EMAIL', 'ops@example.test');
  vi.stubEnv('AUTH_SECRET', 'test-only-consultation-secret');
  vi.stubEnv('BUSINESS_ALIMTALK_ENABLED', 'true');
  db = await setupServerTestEnv();
  await seedBusinessCalendar();
  buyer = await member((await seedBuyerWorkspace(db)).id, 'buyer', 'creator');
  pg = await member((await seedPgWorkspace(db, 'Pilot Payments')).id, 'pg', 'representative');
  peer = await member(pg.workspaceId, 'pg', 'submitter');
  await db.update(users).set({ emailVerified: true, businessAlimtalkEnabled: true });
  await db
    .update(workspaceMembers)
    .set({ assignmentAlimtalkConsentAt: new Date() })
    .where(eq(workspaceMembers.userId, pg.userId));
  viewer = pg;
  groupId = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: '일반 판매' });
  await recommend(pg.workspaceId);
  await db.insert(pgAssignmentPolicies).values({
    pgId: pg.workspaceId,
    enabled: true,
    alimtalkReady: true,
    contactDays: 1,
    threshold: 2,
    windowDays: 30,
    managerId: peer.userId,
    roster: [
      { userId: peer.userId, groupId: null, size: '100m' },
      { userId: pg.userId, groupId, size: '50m' },
    ],
  });
  input = {
    title: '의류 판매',
    deadline: validBusinessDeadline(3),
    allowedPgWorkspaceIds: [pg.workspaceId],
    requiredPaymentMethods: ['card'],
    customPaymentMethods: [],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
    send: true,
    boardVisible: false,
    currentFeeVisibleToPg: true,
    bizProfileMode: 'none',
    websiteUrl: 'https://shop.example',
    mainProducts: '의류',
    deliveryServicePeriod: 'D+3',
    contractType: 'new',
    expectedVolume: '50m',
    requestKey: randomUUID(),
    industryGroupId: groupId,
    contactConsent: { pgId: pg.workspaceId, version: CONTACT_CONSENT_VERSION },
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  return teardownServerTestEnv();
});
async function recommend(id: string) {
  const policy = {
    risk: 'white' as const,
    candidates: [{ pgWorkspaceId: id, reason: '신청 가능', feeMin: null, feeMax: null, feeNote: '' }],
  };
  await db
    .insert(pgMatchingPolicies)
    .values({ groupId, policy })
    .onConflictDoUpdate({ target: pgMatchingPolicies.groupId, set: { policy } });
}
async function create(overrides: Partial<ParsedCreateRfpInput> = {}) {
  const result = await (await getRfpService()).createRfp({ ...input, ...overrides }, buyer);
  if (!result.ok) throw Error(result.error);
  const rfp = (await (await getRfpRepo()).findByCode(result.rfpId))!;
  const [review] = await (await getPgMatchingRepo()).reviews(rfp.id);
  return { rfp, review, result };
}
async function quote(rfpId: string, actor: Person) {
  return (await getBidService()).submit(
    {
      rfpId,
      settleCycle: 'D+3',
      settleLimit: 1000000,
      guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: { card: { sole: 0.8, sme1: 1.2, sme2: 1.5, sme3: 1.7, general: 2 } },
      customFees: {},
    },
    actor,
  );
}
async function tagged(rfpId: string) {
  viewer = pg;
  const sent = await sendChatMessageAction({
    counterpartyWorkspaceId: buyer.workspaceId,
    body: '첫 상담 안내입니다.',
    rfpId,
  });
  if (!sent.ok) throw Error(sent.error);
  return sent;
}
async function mail() {
  return (await getOutboxRepo()).pending(100);
}
it('실적 경계와 예상 상위 두 구간을 구분한다', () => {
  for (const [amount, expected] of [
    ['49999999', null],
    ['50000000', '50m'],
    ['100000000', '100m'],
  ] as const)
    expect(
      assignmentSize({ contractType: 'renewal', monthlyAvgPgVolume: amount, expectedVolume: '100m' }),
    ).toBe(expected);
  expect(
    (['under10m', '10m', '30m', '50m', '100m'] as const).map((expectedVolume) =>
      assignmentSize({ contractType: 'new', expectedVolume }),
    ),
  ).toEqual([null, null, null, '50m', '100m']);
});
it('동의·구매사 자격을 확인하고 PG 전체 중 지정된 한 사람에게만 신청을 전달한다', async () => {
  const svc = await getRfpService();
  expect(await svc.createRfp({ ...input, contactConsent: undefined }, buyer)).toMatchObject({
    ok: false,
    error: 'MATCHING_CONTACT_CONSENT',
  });
  await db.update(users).set({ emailVerified: false }).where(eq(users.id, buyer.userId));
  expect((await svc.createRfp(input, buyer)).ok).toBe(false);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, buyer.userId));
  const { result, review, rfp } = await create();
  expect(await svc.createRfp(input, buyer)).toEqual(result);
  expect(rfp.expectedVolume).toBe('50m');
  const [c] = await db.select().from(consultationCases);
  expect(c).toMatchObject({
    reviewId: review.id,
    assignee: pg.userId,
    revision: 1,
    consentBy: buyer.userId,
    consentVersion: CONTACT_CONSENT_VERSION,
    quoteDue: input.deadline,
  });
  expect(c.consentText).toContain('Pilot Payments');
  const emails = await mail();
  const rep = emails.filter(
    (e) => e.html.includes('creator@example.test') && e.event === 'rfp.consultation',
  );
  expect(rep.map((e) => e.to)).toEqual(['representative@example.test']);
  expect(rep[0].html).toContain('구매사가 적은 예상');
  expect((await prepareConsultationMail(rep[0]))?.html).toContain('creator@example.test');
  await db.update(users).set({ email: 'new-contact@example.test' }).where(eq(users.id, buyer.userId));
  const refreshed = await prepareConsultationMail(rep[0]);
  expect(refreshed?.html).toContain('new-contact@example.test');
  expect(refreshed?.html).not.toContain('creator@example.test');
  expect((await db.select().from(alimtalkOutbox)).map((r) => r.userId)).toEqual([pg.userId]);
  expect(await (await getConsultationRepo()).buyerContact(c.reviewId, peer)).toBeUndefined();
  const alimtalk = await getAlimtalkRepo();
  const [queued] = await alimtalk.claim();
  expect(await alimtalk.canSend(queued)).toBe(true);
  await db.update(consultationCases).set({ assignee: peer.userId, revision: 2 });
  expect(await prepareConsultationMail(rep[0])).toBeNull();
  expect(await alimtalk.canSend(queued)).toBe(false);
  await runConsultationDeadlines();
  await runConsultationDeadlines();
  expect(
    (await mail()).filter((e) => e.event === 'rfp.consultation' && e.to === 'submitter@example.test'),
  ).toHaveLength(1);
  expect((await db.select().from(consultationCases))[0].contactDue).toEqual(c.contactDue);
  expect((await db.select().from(alimtalkOutbox)).map((row) => row.userId)).toEqual([pg.userId]);
});
it('적격 담당자가 없으면 미배정과 운영 알림을 남긴다', async () => {
  await db
    .update(workspaceMembers)
    .set({ approvalStatus: 'pending_approval' })
    .where(eq(workspaceMembers.userId, pg.userId));
  await create();
  expect((await db.select().from(consultationCases))[0].assignee).toBeNull();
  const emails = (await mail()).filter((e) => e.event === 'rfp.consultation');
  expect(emails.map((e) => e.to)).toEqual(['ops@example.test']);
  expect(emails[0].html).not.toContain('creator@example.test');
});
it('실시간과 재조회에서 첫 연락은 PG사명이다. 다른 요청·다른 제출자의 견적과 선정을 구분한다', async () => {
  const { rfp } = await create();
  const other = await create({ requestKey: randomUUID() });
  expect((await quote(other.rfp.id, pg)).ok).toBe(true);
  const sent = await tagged(rfp.id);
  const hidden = {
    authorName: 'Pilot Payments',
    authorEmail: '',
    authorUserId: '',
    authorAvatarUpdatedAt: null,
  };
  expect(publishChatEvent).toHaveBeenCalledWith(sent.conversationId, expect.objectContaining(hidden));
  viewer = buyer;
  async function author() {
    const thread = await loadConversationThread(sent.conversationId);
    if (!thread.ok) throw Error(thread.error);
    return thread.messages.find((m) => m.id === sent.messageId);
  }
  expect(await author()).toMatchObject(hidden);
  const bid = await quote(rfp.id, peer);
  if (!bid.ok) throw Error(bid.error);
  expect(await author()).toMatchObject(hidden);
  await db.update(rfps).set({ awardedBidId: bid.bidId, status: 'awarded' }).where(eq(rfps.id, rfp.id));
  expect(await author()).toMatchObject(hidden);
  const same = await create({ requestKey: randomUUID() });
  const msg = await tagged(same.rfp.id);
  const b = await quote(same.rfp.id, pg);
  if (!b.ok) throw Error(b.error);
  viewer = buyer;
  async function message() {
    const t = await loadConversationThread(msg.conversationId);
    if (!t.ok) throw Error(t.error);
    return t.messages.find((m) => m.id === msg.messageId);
  }
  expect(await message()).toMatchObject({ ...hidden, authorName: 'representative' });
  await db
    .update(rfps)
    .set({ awardedBidId: b.bidId, status: 'awarded' })
    .where(eq(rfps.id, same.rfp.id));
  expect(await message()).toMatchObject({
    authorName: 'representative',
    authorEmail: 'representative@example.test',
    authorUserId: pg.userId,
  });
});
it('이메일 GET은 읽기 전용이고 미수신 이후 실제 읽음은 재전환을 막으며 최초 불일치는 남는다', async () => {
  const { rfp, review } = await create();
  const sent = await tagged(rfp.id);
  const repo = await getConsultationRepo();
  const q = (await repo.latest(review.id))!;
  const ctx = { params: Promise.resolve({ id: q.id }) };
  expect((await GET(new Request('https://test.invalid/confirm'), ctx)).status).toBe(200);
  expect((await repo.question(q.id))?.answer).toBeNull();
  const post = (token: string) =>
    POST(
      new Request('https://test.invalid/confirm', {
        method: 'POST',
        body: new URLSearchParams({ token, answer: 'missed' }),
      }),
      ctx,
    );
  expect((await post('a'.repeat(43))).status).toBe(410);
  expect(await answerContact(q.id, true, { actor: peer })).toMatchObject({ ok: false });
  expect((await post(questionToken(q))).status).toBe(200);
  expect((await post(questionToken(q))).status).toBe(200);
  expect(await repo.progress(review.id)).toMatchObject({ disputed: true, canSwitch: false });
  await db.update(consultationCases).set({ contactDue: new Date(Date.now() - 60000) });
  expect(await repo.progress(review.id)).toMatchObject({ canSwitch: true });
  await runConsultationDeadlines();
  await runConsultationDeadlines();
  const [switchNotice] = (await mail()).filter((entry) => entry.dedupeKey?.includes('switch-' + q.id));
  expect(await prepareConsultationMail(switchNotice)).toBeTruthy();
  const colleague = await member(buyer.workspaceId, 'buyer', 'colleague');
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, colleague.userId));
  const read = {
    viewer: { userId: colleague.userId, activeWorkspaceId: buyer.workspaceId },
    conversationId: sent.conversationId,
    throughMessageId: sent.messageId,
  };
  await (await getConversationReadState()).markRead(read);
  await (await getConversationReadState()).markRead(read);
  expect(await prepareConsultationMail(switchNotice)).toBeNull();
  const evidence = await db.select().from(consultationEvidence);
  expect(evidence).toHaveLength(1);
  expect(evidence[0].observedAt.getTime()).toBeGreaterThan(new Date(sent.createdAt).getTime());
  expect(await repo.progress(review.id)).toMatchObject({
    firstContactAt: evidence[0].observedAt,
    disputed: true,
    missed: false,
    canSwitch: false,
  });
  await db.update(consultationQuestions).set({ judgment: 'absent', reason: '작성자 미수신 확인' });
  expect(await repo.progress(review.id)).toMatchObject({
    firstContactAt: evidence[0].observedAt,
    contactLate: true,
    disputed: false,
  });
});
it('재질문과 만료 후 이전 링크가 닫히며 미응답은 다음 영업일에 한 번만 안내한다', async () => {
  const { review } = await create();
  const repo = await getConsultationRepo();
  expect((await reportContact(review.id, peer, null)).ok).toBe(false);
  expect((await reportContact(review.id, pg, null)).ok).toBe(true);
  const q = (await repo.latest(review.id))!;
  await db.update(consultationQuestions).set({ remindAt: new Date(Date.now() - 1000) });
  await runConsultationDeadlines();
  await runConsultationDeadlines();
  expect(
    (await db.select().from(consultationEvents)).filter((e) => e.key === 'remind-' + q.id),
  ).toHaveLength(1);
  expect((await mail()).filter((e) => e.dedupeKey?.includes('"reminder"')).map((e) => e.to)).toEqual([
    'creator@example.test',
  ]);
  expect((await answerContact(q.id, false, { actor: buyer })).ok).toBe(true);
  expect((await reportContact(review.id, pg, q.id)).ok).toBe(true);
  expect((await answerContact(q.id, true, { token: questionToken(q) })).ok).toBe(false);
  const latest = (await repo.latest(review.id))!;
  expect(latest.id).not.toBe(q.id);
  await db
    .update(consultationQuestions)
    .set({ expiresAt: new Date(Date.now() - 100) })
    .where(eq(consultationQuestions.id, latest.id));
  expect((await answerContact(latest.id, true, { token: questionToken(latest) })).ok).toBe(false);
});
it('합의 기한부터 다른 PG에 새로 동의할 수 있고 전환·제출 중 하나만 성공한다', async () => {
  const { rfp, review } = await create();
  const beta = await seedPgWorkspace(db, '다음 PG');
  const rep = await member(beta.id, 'pg', 'beta');
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, rep.userId));
  await db.insert(pgAssignmentPolicies).values({
    pgId: beta.id,
    enabled: true,
    contactDays: 2,
    threshold: 2,
    windowDays: 14,
    managerId: rep.userId,
    roster: [{ userId: rep.userId, size: null, groupId: null }],
  });
  await recommend(beta.id);
  const svc = await getPgMatchingService();
  const next = (consent = true) =>
    svc.endAndNext(
      rfp.id,
      review.id,
      beta.id,
      validBusinessDeadline(),
      buyer,
      false,
      consent ? { pgId: beta.id, version: CONTACT_CONSENT_VERSION } : undefined,
    );
  expect(await next()).toMatchObject({ ok: false, error: 'RFP_NOT_EXPIRED' });
  await db.update(consultationCases).set({ contactDue: new Date(Date.now() - 1000) });
  expect(await next(false)).toMatchObject({ ok: false, error: 'MATCHING_CONTACT_CONSENT' });
  const results = await Promise.all([next(), quote(rfp.id, pg)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const reviews = await (await getPgMatchingRepo()).reviews(rfp.id);
  expect(reviews.filter((r) => ['requested', 'reviewing', 'quoted'].includes(r.status))).toHaveLength(
    1,
  );
});
