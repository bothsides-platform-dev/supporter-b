import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedBuyerWorkspace, seedUser, seedPgWorkspace, seedMembership } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getRfpService } from '../rfp';
import { getPgMatchingService } from '../pg-matching';
import { getBidService } from '../bid';
import { getRfpRepo, getPgMatchingRepo, getAuditLogRepo } from '@/lib/server/repositories/factory';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { CreateRfpServiceInput } from '../rfp';
import { createRfpAction } from '@/lib/server/actions/rfp/createRfpAction';
import { recommendPgAction, requestNextPgAction } from '@/lib/server/actions/rfp/matching';
import { loadBuyerRfpDetail, loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { pgRecommendationGroups, pgMatchingPolicies, rfpMatchingRequests, rfpPgReviews, rfps, workspaces, outboxEntries, notifications } from '@/lib/db/schema';

vi.mock('@/lib/server/outbox/post-commit', () => ({ flushAfterCommit: vi.fn() }));
vi.mock('@/lib/server/actions/_session', () => ({ requireBuyerActor: async () => ({ ok: true, ...buyer, email: 'buyer@example.com' }) }));
vi.mock('@/lib/server/notifications/dispatch', async importOriginal => ({ ...await importOriginal<object>(), emitAfterCommit: vi.fn() }));
const testPgCookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', async importOriginal => ({ ...await importOriginal<object>(), cookies: async () => ({ get: () => testPgCookie.value ? { value: testPgCookie.value } : undefined }) }));
vi.mock('next/cache', async importOriginal => ({ ...await importOriginal<object>(), revalidatePath: vi.fn() }));

let db: PgliteDB;
let buyer: { userId: string; workspaceId: string };
let pg: { userId: string; workspaceId: string };
let input: CreateRfpServiceInput;
let groupId: string;
beforeEach(async () => {
  testPgCookie.value = undefined;
  db = await setupServerTestEnv();
  const u = await seedUser(db);
  const b = await seedBuyerWorkspace(db);
  const p = await seedPgWorkspace(db, 'Alpha Payments');
  const pu = await seedUser(db, { email: 'pg@matching.example' });
  await seedMembership(db, b.id, u.id, 'admin');
  await seedMembership(db, p.id, pu.id, 'admin');
  buyer = { userId: u.id, workspaceId: b.id };
  pg = { userId: pu.id, workspaceId: p.id };
  input = { title: '온라인 판매', deadline: new Date(Date.now() + 86400000), allowedPgWorkspaceIds: [p.id], requiredPaymentMethods: ['card'], customPaymentMethods: [], send: true, boardVisible: true, currentFeeVisibleToPg: true, bizProfileMode: 'none', websiteUrl: 'https://example.com', mainProducts: '의류', contractType: 'new' };
  groupId = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: '일반 판매' });
  await db.insert(pgMatchingPolicies).values({ groupId, policy: { risk: 'white', candidates: [{ pgWorkspaceId: p.id, reason: '일반 판매 상담', feeMin: 0.8, feeMax: 0.9, feeNote: '부가세 별도' }] } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); return teardownServerTestEnv(); });

describe('맞춤 PG 상담 생성', () => {
  it('목록에서 여러 상담의 최신 검토 상태를 한 번에 읽는다', async () => {
    const created = await (await getRfpService()).createRfp({ ...input, industryGroupId: groupId, requestKey: randomUUID() }, buyer);
    if (!created.ok) throw new Error(created.error);
    const rfp = (await (await getRfpRepo()).findByCode(created.rfpId))!;
    const second = await (await getRfpService()).createRfp({ ...input, industryGroupId: groupId, requestKey: randomUUID() }, buyer);
    if (!second.ok) throw new Error(second.error);
    const secondRfp = (await (await getRfpRepo()).findByCode(second.rfpId))!;
    const matching = await getPgMatchingRepo();
    expect(await matching.latestStatuses([])).toEqual(new Map());
    expect(await matching.latestStatuses([rfp.id, secondRfp.id, randomUUID()])).toEqual(new Map([[rfp.id, 'requested'], [secondRfp.id, 'requested']]));
    const [review] = await matching.reviews(rfp.id);
    await matching.updateReview(review.id, 'reviewing', '', db);
    expect(await matching.latestStatuses([rfp.id, secondRfp.id])).toEqual(new Map([[rfp.id, 'reviewing'], [secondRfp.id, 'requested']]));

    await matching.updateReview(review.id, 'rejected', '조건 불일치', db);
    const nextPg = await seedPgWorkspace(db, 'Next Payments');
    await matching.addReview(rfp.id, {
      pgWorkspaceId: nextPg.id,
      name: 'Next Payments',
      reason: '다음 상담',
      feeMin: null,
      feeMax: null,
      feeNote: '',
    }, db);
    const newerReview = (await matching.reviews(rfp.id)).at(-1)!;
    await db.update(rfpPgReviews).set({ createdAt: new Date(Date.now() + 1000) }).where(eq(rfpPgReviews.id, newerReview.id));
    expect(await matching.latestStatuses([rfp.id])).toEqual(new Map([[rfp.id, 'requested']]));
  });
  it('새 상담·검토·거절·다음 요청만 커밋 후 운영자에게 한 번씩 알린다', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T0/B0/test');
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      expect(await db.select().from(rfps)).toHaveLength(1);
      sent.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, text: async () => 'ok' };
    }));
    const request = { ...input, industryGroupId: groupId, requestKey: randomUUID() };
    const rfpService = await getRfpService();
    const created = await rfpService.createRfp(request, buyer);
    expect(created.ok).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toContain('맞춤 상담 요청');
    expect(sent[0]).toContain('Alpha Payments');
    expect(await rfpService.createRfp(request, buyer)).toEqual(created);
    expect(sent).toHaveLength(1);

    if (!created.ok) throw new Error(created.error);
    const rfp = (await (await getRfpRepo()).findByCode(created.rfpId))!;
    const [review] = await (await getPgMatchingRepo()).reviews(rfp.id);
    const matching = await getPgMatchingService();
    expect((await matching.review(rfp.id, review.id, 'reviewing', '', pg)).ok).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toContain('상담 검토 시작');
    expect((await matching.review(rfp.id, review.id, 'reviewing', '', pg)).ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect((await matching.review(rfp.id, review.id, 'rejected', '조건 불일치', pg)).ok).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]).toContain('상담 거절');
    expect((await matching.review(rfp.id, review.id, 'rejected', '조건 불일치', pg)).ok).toBe(false);
    expect(sent).toHaveLength(3);

    const nextPg = await seedPgWorkspace(db, 'Beta Payments');
    await seedMembership(db, nextPg.id, pg.userId, 'admin');
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: nextPg.id, reason: '다음 상담', feeMin: null, feeMax: null, feeNote: '' }] } });
    expect((await matching.next(rfp.id, review.id, nextPg.id, new Date(Date.now() + 7 * 86400000), buyer)).ok).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(4));
    expect(sent[3]).toContain('다음 PG사 상담 요청');
    expect(sent[3]).toContain('Beta Payments');
    expect((await matching.next(rfp.id, review.id, nextPg.id, new Date(Date.now() + 7 * 86400000), buyer)).ok).toBe(false);
    expect(sent).toHaveLength(4);
  });
  it('검토 상태 쓰기 후 트랜잭션이 롤백되면 운영자에게 알리지 않는다', async () => {
    const { rfp, review } = await create();
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T0/B0/test');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchSpy);
    const audit = vi.spyOn(await getAuditLogRepo(), 'insert').mockRejectedValueOnce(new Error('audit down'));
    try {
      await expect((await getPgMatchingService()).review(rfp.id, review.id, 'reviewing', '', pg))
        .rejects.toThrow('audit down');
      expect((await (await getPgMatchingRepo()).reviews(rfp.id))[0].status).toBe('requested');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { audit.mockRestore(); }
  });
  it('새 요청은 매칭 정보를 생략해도 기존 발송 경로로 우회할 수 없다', async () => {
    expect(await (await getRfpService()).createRfp(input, buyer)).toEqual({ ok: false, error: 'MATCHING_REQUIRED' });
  });
  const matchingInput = () => ({ ...input, industryGroupId: groupId, requestKey: randomUUID() });
  it('액션이 검증한 업종과 제출 키를 서비스로 전달한다', async () => {
    const result = await createRfpAction({ ...matchingInput(), deadline: input.deadline.toISOString(), requiredPaymentMethods: ['card'], currentSolution: undefined, gradeOverride: undefined });
    expect(result.ok).toBe(true);
    expect(await db.select().from(rfpMatchingRequests)).toHaveLength(1);
  });
  it('상담을 생성하며 정책과 선택 조건을 보존하고 공개 게시판에는 노출하지 않는다', async () => {
    const result = await (await getRfpService()).createRfp(matchingInput(), buyer);
    expect(result.ok).toBe(true);
    expect(await db.select().from(rfpMatchingRequests)).toEqual([expect.objectContaining({ industryName: '일반 판매', risk: 'white', buyerWsId: buyer.workspaceId })]);
    expect(await db.select().from(rfpPgReviews)).toEqual([expect.objectContaining({ status: 'requested', pgWorkspaceId: pg.workspaceId, candidate: expect.objectContaining({ feeMin: 0.8 }) })]);
    expect((await db.select().from(rfps))[0].boardVisible).toBe(false);
  });
  it.each(['black', 'unconfigured'] as const)('%s 업종을 직접 발송해도 아무 요청도 생성하지 않는다', async risk => {
    await db.update(pgMatchingPolicies).set({ policy: { risk, candidates: [] } });
    expect(await (await getRfpService()).createRfp(matchingInput(), buyer)).toEqual({ ok: false, error: 'MATCHING_UNAVAILABLE' });
    expect(await db.select().from(rfps)).toHaveLength(0);
  });
  it('추천에 없는 PG·정지 PG·다중 PG를 거부한다', async () => {
    const other = await seedPgWorkspace(db, 'Beta');
    const service = await getRfpService();
    expect((await service.createRfp({ ...matchingInput(), allowedPgWorkspaceIds: [other.id] }, buyer)).ok).toBe(false);
    expect((await service.createRfp({ ...matchingInput(), allowedPgWorkspaceIds: [pg.workspaceId, other.id] }, buyer)).ok).toBe(false);
    await db.update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, pg.workspaceId));
    expect((await service.createRfp(matchingInput(), buyer)).ok).toBe(false);
    expect(await db.select().from(rfps)).toHaveLength(0);
  });
  it('기본 상태에서는 정책에 든 테스트용 PG로 상담을 요청하거나 다음 상담을 이어갈 수 없다', async () => {
    const testPg = await seedPgWorkspace(db, 'Test Payments');
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    expect(await (await getRfpService()).createRfp({ ...matchingInput(), allowedPgWorkspaceIds: [testPg.id] }, buyer)).toEqual({ ok: false, error: 'MATCHING_UNAVAILABLE' });
    expect(await db.select().from(rfps)).toHaveLength(0);

    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: pg.workspaceId, reason: '일반 판매 상담', feeMin: 0.8, feeMax: 0.9, feeNote: '부가세 별도' }] } });
    const { rfp, review } = await create();
    await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '검토 조건이 맞지 않아요', pg);
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    expect(await (await getPgMatchingService()).next(rfp.id, review.id, testPg.id, new Date(Date.now() + 86400000), buyer)).toEqual({ ok: false, error: 'MATCHING_UNAVAILABLE' });
  });
  it('표시 쿠키로 공개된 테스트 PG는 요청하고 다음 상담 후보로도 선택할 수 있다', async () => {
    const testPg = await seedPgWorkspace(db, 'Test Payments');
    await seedMembership(db, testPg.id, pg.userId, 'admin');
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    const service = await getRfpService();
    const created = await service.createRfp({ ...matchingInput(), allowedPgWorkspaceIds: [testPg.id] }, buyer, true);
    expect(created.ok).toBe(true);

    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: pg.workspaceId, reason: '첫 상담', feeMin: null, feeMax: null, feeNote: '' }] } });
    const { rfp, review } = await create();
    await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '조건 불일치', pg);
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    const matching = await getPgMatchingService();
    expect((await matching.forBuyer(rfp.id, buyer.workspaceId, true))?.recommendation.candidates).toEqual([
      expect.objectContaining({ pgWorkspaceId: testPg.id }),
    ]);
    expect((await matching.next(rfp.id, review.id, testPg.id, new Date(Date.now() + 86400000), buyer, true)).ok).toBe(true);
  });
  it('추천 화면의 테스트 PG 표시 쿠키를 생성·다음 요청 액션에도 전달한다', async () => {
    const testPg = await seedPgWorkspace(db, 'Test Payments');
    await seedMembership(db, testPg.id, pg.userId, 'admin');
    testPgCookie.value = '1';
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    const visible = await recommendPgAction(groupId);
    if (!visible.ok) throw new Error(visible.error);
    expect(visible.recommendation.candidates).toEqual([expect.objectContaining({ pgWorkspaceId: testPg.id })]);
    const created = await createRfpAction({ ...matchingInput(), allowedPgWorkspaceIds: [testPg.id], deadline: input.deadline.toISOString(), requiredPaymentMethods: ['card'], gradeOverride: undefined, currentSolution: undefined });
    expect(created.ok).toBe(true);

    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: pg.workspaceId, reason: '첫 상담', feeMin: null, feeMax: null, feeNote: '' }] } });
    const { rfp, review } = await create();
    await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '조건 불일치', pg);
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: testPg.id, reason: '내부 검증', feeMin: null, feeMax: null, feeNote: '' }] } });
    expect((await requestNextPgAction({ rfpId: rfp.id, previousReviewId: review.id, pgWorkspaceId: testPg.id, deadline: new Date(Date.now() + 86400000).toISOString() })).ok).toBe(true);
  });
  it('같은 제출 키 재시도는 최초 요청을 반환하고 초대를 추가하지 않는다', async () => {
    const request = matchingInput();
    const service = await getRfpService();
    const first = await service.createRfp(request, buyer);
    expect(await service.createRfp(request, buyer)).toEqual(first);
    expect(await db.select().from(rfps)).toHaveLength(1);
  });
  it('같은 제출 키로 내용을 바꾼 재시도는 이전 상담을 성공으로 안내하지 않는다', async () => {
    const request = matchingInput();
    const service = await getRfpService();
    expect((await service.createRfp(request, buyer)).ok).toBe(true);
    expect(await service.createRfp({ ...request, title: '변경된 상담 제목' }, buyer)).toEqual({ ok: false, error: 'MATCHING_REQUEST_CHANGED' });
    const other = await seedPgWorkspace(db, 'Beta Payments');
    expect(await service.createRfp({ ...request, allowedPgWorkspaceIds: [other.id] }, buyer)).toEqual({ ok: false, error: 'MATCHING_REQUEST_CHANGED' });
    expect(await db.select().from(rfps)).toHaveLength(1);
  });
  async function create() {
    const result = await (await getRfpService()).createRfp(matchingInput(), buyer);
    if (!result.ok) throw new Error(result.error);
    const rfp = (await (await getRfpRepo()).findByCode(result.rfpId))!;
    const [review] = await (await getPgMatchingRepo()).reviews(rfp.id);
    return { rfp, review };
  }
  const quote = (rfpId: string) => ({ rfpId, settleCycle: 'D+3', settleLimit: 1000000, guaranteeInsurance: 0, signupFee: 0, paymentFees: { card: { sole: 0.8, small1: 1.2, small2: 1.5, small3: 1.7, general: 2 } }, customFees: {} });
  it('현재 PG만 검토와 거절을 기록하고 구매사에게 이력과 다음 후보를 돌려준다', async () => {
    const { rfp, review } = await create();
    const service = await getPgMatchingService();
    expect((await service.review(rfp.id, review.id, 'rejected', '업종 검토가 어려워요', buyer)).ok).toBe(false);
    expect((await service.review(rfp.id, review.id, 'reviewing', '', pg)).ok).toBe(true);
    expect((await service.review(rfp.id, review.id, 'rejected', '업종 검토가 어려워요', pg)).ok).toBe(true);
    const data = await service.forBuyer(rfp.id, buyer.workspaceId);
    expect(data?.reviews[0]).toMatchObject({ status: 'rejected', reason: '업종 검토가 어려워요' });
    expect(data?.recommendation.candidates).toEqual([]);
    const mail = (await db.select().from(outboxEntries)).filter(r => r.event === 'rfp.matching_ended');
    expect(mail).toHaveLength(1);
    expect(mail[0].html).toContain('업종 검토가 어려워요');
    expect(await service.forBuyer(rfp.id, pg.workspaceId)).toBeNull();
  });
  it('거절 PG는 직접 호출로 견적을 제출할 수 없다', async () => {
    const { rfp, review } = await create();
    await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '추가 검토가 필요해요', pg);
    expect(await (await getBidService()).submit(quote(rfp.id), pg)).toMatchObject({ ok: false, error: 'MATCHING_REVIEW_CLOSED' });
  });
  it('견적 제출은 quoted로 전환하고 철회하면 다음 추천으로 이어진다', async () => {
    const { rfp, review } = await create();
    const bids = await getBidService();
    const result = await bids.submit(quote(rfp.id), pg);
    expect(result.ok).toBe(true);
    expect((await (await getPgMatchingRepo()).reviews(rfp.id))[0].status).toBe('quoted');
    expect((await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '늦은 거절', pg)).ok).toBe(false);
    if (!result.ok) throw new Error(result.error);
    expect((await bids.withdraw(result.bidId, pg)).ok).toBe(true);
    expect((await (await getPgMatchingRepo()).reviews(rfp.id))[0].status).toBe('withdrawn');
    expect((await db.select().from(outboxEntries)).filter(r => r.event === 'rfp.matching_ended')).toHaveLength(1);
  });
  it.each(['cancel', 'close'] as const)('견적 전 상담을 %s하면 상담 PG에도 종료 알림을 보낸다', async action => {
    const { rfp } = await create();
    const result = await (await getRfpService())[action](rfp.id, buyer);
    expect(result.ok).toBe(true);
    const messages = await db.select().from(notifications).where(eq(notifications.workspaceId, pg.workspaceId));
    expect(messages).toContainEqual(expect.objectContaining({ type: action === 'cancel' ? 'rfp.cancelled' : 'rfp.closed' }));
  });
  it('마감 후 견적을 철회해도 다음 PG 상담 요청 알림을 보내지 않는다', async () => {
    const { rfp } = await create();
    const submitted = await (await getBidService()).submit(quote(rfp.id), pg);
    if (!submitted.ok) throw new Error(submitted.error);
    expect((await (await getRfpService()).close(rfp.id, buyer)).ok).toBe(true);
    expect((await (await getBidService()).withdraw(submitted.bidId, pg)).ok).toBe(true);
    expect((await db.select().from(outboxEntries)).filter(r => r.event === 'rfp.matching_ended')).toHaveLength(0);
  });
  it('거절 후 다음 요청은 마감일을 갱신하고 과거 회차 재전송을 막는다', async () => {
    const { rfp, review } = await create();
    const nextPg = await seedPgWorkspace(db, 'Beta Payments');
    await seedMembership(db, nextPg.id, pg.userId, 'admin');
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'gray', candidates: [{ pgWorkspaceId: nextPg.id, reason: '추가 검토 상담', feeMin: null, feeMax: null, feeNote: '' }] } });
    const service = await getPgMatchingService();
    expect((await service.next(rfp.id, review.id, nextPg.id, input.deadline, buyer)).ok).toBe(false);
    await service.review(rfp.id, review.id, 'rejected', '검토 조건이 맞지 않아요', pg);
    const deadline = new Date(Date.now() + 7 * 86400000);
    expect((await service.next(rfp.id, review.id, nextPg.id, new Date(0), buyer)).ok).toBe(false);
    expect((await service.next(rfp.id, review.id, nextPg.id, deadline, buyer)).ok).toBe(true);
    expect((await (await getRfpRepo()).findById(rfp.id))?.deadline).toBe(deadline.toISOString());
    expect((await service.next(rfp.id, review.id, nextPg.id, deadline, buyer)).ok).toBe(false);
    expect(await (await getPgMatchingRepo()).reviews(rfp.id)).toHaveLength(2);
  });
  it('매칭 요청에 기존 PG 추가 초대 경로를 사용할 수 없다', async () => {
    const { rfp } = await create();
    const nextPg = await seedPgWorkspace(db, 'Beta Payments');
    const service = await getRfpService();
    expect(await service.addPgWorkspaces(rfp.code, [nextPg.id], buyer)).toMatchObject({ ok: false, error: 'MATCHING_ONLY' });
    expect(await service.sendDraftInvitations(rfp.code, buyer)).toMatchObject({ ok: false, error: 'MATCHING_ONLY' });
  });
  it('구매사는 상담 이력을 보고 거절 PG는 자기 검토 결과만 받는다', async () => {
    const { rfp, review } = await create();
    await (await getPgMatchingService()).review(rfp.id, review.id, 'rejected', '취급 조건 확인', pg);
    const buyerData = await loadBuyerRfpDetail({ code: rfp.code, workspaceId: buyer.workspaceId, userId: buyer.userId, userName: '구매 담당' });
    expect(buyerData?.matching?.reviews).toHaveLength(1);
    const pgData = await loadPgRfpDetail({ code: rfp.code, workspaceId: pg.workspaceId });
    expect(pgData?.review).toEqual({ id: review.id, status: 'rejected', reason: '취급 조건 확인' });
    expect(pgData?.bidWindowOpen).toBe(false);
    expect(pgData).not.toHaveProperty('matching');
  });

  it('과거 라운드 철회로 진행 중인 상담을 끝내지 않고 최종 철회 시 모든 라운드를 닫는다', async () => {
    const { rfp } = await create();
    const bids = await getBidService();
    const first = await bids.submit(quote(rfp.id), pg);
    if (!first.ok) throw new Error(first.error);
    await (await getRfpService()).requote(rfp.id, { targetPgWsIds: [pg.workspaceId], message: '조건 재검토', newDeadline: input.deadline }, buyer);
    const second = await bids.submit(quote(rfp.id), pg);
    if (!second.ok) throw new Error(second.error);
    expect((await bids.withdraw(first.bidId, pg)).ok).toBe(false);
    expect((await (await getPgMatchingRepo()).reviews(rfp.id))[0].status).toBe('quoted');
    expect((await bids.withdraw(second.bidId, pg)).ok).toBe(true);
    expect((await loadBuyerRfpDetail({ code: rfp.code, workspaceId: buyer.workspaceId, userId: buyer.userId, userName: '담당' }))?.bids).toHaveLength(0);
    expect((await (await getRfpService()).award(rfp.id, first.bidId, buyer)).ok).toBe(false);
  });
  it('매칭 요청을 공개 게시판으로 바꿀 수 없다', async () => {
    const { rfp } = await create();
    expect(await (await getRfpService()).setBoardVisible(rfp.code, true, buyer)).toMatchObject({ ok: false, error: 'MATCHING_ONLY' });
  });

  it('행 잠금을 기다리는 사이 지난 마감일로 다음 상담을 만들지 않는다', async () => {
    const { rfp, review } = await create();
    const nextPg = await seedPgWorkspace(db, 'Beta');
    await db.update(pgMatchingPolicies).set({ policy: { risk: 'white', candidates: [{ pgWorkspaceId: nextPg.id, reason: '판매 상담', feeMin: null, feeMax: null, feeNote: '' }] } });
    const service = await getPgMatchingService();
    await service.review(rfp.id, review.id, 'rejected', '입점 조건 불일치', pg);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const repo = await getRfpRepo();
    const original = repo.findByIdForUpdate.bind(repo);
    const lock = vi.spyOn(repo, 'findByIdForUpdate').mockImplementation(async (...args) => { const row = await original(...args); clock.mockReturnValue(now + 2000); return row; });
    try {
      expect(await service.next(rfp.id, review.id, nextPg.id, new Date(now + 1000), buyer)).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
      expect(await (await getPgMatchingRepo()).reviews(rfp.id)).toHaveLength(1);
    } finally { lock.mockRestore(); clock.mockRestore(); }
  });

});
