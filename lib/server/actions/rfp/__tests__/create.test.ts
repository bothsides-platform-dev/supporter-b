import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';

import { randomUUID } from 'node:crypto';
import {
  attachments,
  bizProfiles,
  outboxEntries,
  rfpInvitations,
  rfps,
  workspaces,
} from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

// Buyer session — patched per test.
const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

const { logBusinessEvent } = vi.hoisted(() => ({ logBusinessEvent: vi.fn() }));
vi.mock('@/lib/observability/log', () => ({
  logBusinessEvent,
  logBusinessWarn: vi.fn(),
  logBusinessError: vi.fn(),
}));

import { createRfpAction } from '../createRfpAction';

let db: PgliteDB;
let buyerUserId: string;
let buyerWsId: string;
let bizId: string;
let pgWsId: string;

async function freshBuyer() {
  const u = await seedUser(db, { email: 'buyer@x.com' });
  const biz = await seedBizProfile(db);
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, ws.id, u.id, 'admin');
  return { userId: u.id, email: u.email, wsId: ws.id, bizId: biz.id };
}

describe('createRfpAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    const seeded = await freshBuyer();
    buyerUserId = seeded.userId;
    buyerWsId = seeded.wsId;
    bizId = seeded.bizId;
    sessionRef.value = {
      user: {
        id: buyerUserId,
        email: seeded.email,
        workspaceId: buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    // Default PG workspace for draft tests (no members needed — drafts skip invite logic)
    const pgWs = await seedPgWorkspace(db, '테스트PG');
    pgWsId = pgWs.id;
    logBusinessEvent.mockReset();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('logs an rfp.sent business event on send', async () => {
    const r = await createRfpAction({
      title: '로그 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['card'],
      send: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(logBusinessEvent).toHaveBeenCalledWith('rfp.sent', {
      rfpId: r.rfpId,
      inviteCount: 1,
    });
  });

  it('does not log a business event for a draft', async () => {
    const r = await createRfpAction({
      title: '드래프트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    expect(logBusinessEvent).not.toHaveBeenCalled();
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [randomUUID()],
    });
    expect(r.ok).toBe(false);
  });

  it('draft branch — inserts RFP status=draft, no invitations, no outbox', async () => {
    const r = await createRfpAction({
      title: '결제 인프라 제안',
      memo: 'D+1 정산 희망',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rfpId).toMatch(/^P-\d{4}-\d{4}$/);

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.status).toBe('draft');
    expect(row.sentAt).toBeNull();

    const invs = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, row.id));
    expect(invs).toHaveLength(0);

    const outbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.invited'));
    expect(outbox).toHaveLength(0);
  });

  it('send=true 인데 결제수단 0개 → INVALID_INPUT', async () => {
    const r = await createRfpAction({
      title: '결제수단 미선택',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: [],
      send: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('draft 는 결제수단 0개여도 허용', async () => {
    const r = await createRfpAction({
      title: '드래프트 결제수단 없음',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: [],
      send: false,
    });
    expect(r.ok).toBe(true);
  });

  it('requiredPaymentMethods 를 RFP 행에 저장한다', async () => {
    const r = await createRfpAction({
      title: '결제수단 저장',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['card', 'bank_transfer'],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.requiredPaymentMethods).toEqual(['card', 'bank_transfer']);
  });

  it('customPaymentMethods label 입력 → 서버가 {id,label} 발급해 저장', async () => {
    const r = await createRfpAction({
      title: '커스텀 결제수단',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: [],
      customPaymentMethods: [{ label: '포인트결제' }],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    const custom = row.customPaymentMethods as { id: string; label: string }[];
    expect(custom).toHaveLength(1);
    expect(custom[0].label).toBe('포인트결제');
    expect(typeof custom[0].id).toBe('string');
    expect(custom[0].id.length).toBeGreaterThan(0);
  });

  it('send=true & enum 0개지만 커스텀 1개 → 허용 (합산 ≥1)', async () => {
    const pg = await seedPgWorkspace(db, '합산검증PG');
    const pgAdmin = await seedUser(db, { email: 'admin@sum.test' });
    await seedMembership(db, pg.id, pgAdmin.id, 'admin');

    const r = await createRfpAction({
      title: '커스텀만으로 발송',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pg.id],
      requiredPaymentMethods: [],
      customPaymentMethods: [{ label: '포인트결제' }],
      send: true,
    });
    expect(r.ok).toBe(true);
  });

  it('send branch — inserts RFP status=sent, N invitations + N invite outbox', async () => {
    // Seed 3 PG workspaces each with one admin — outbox is per admin member
    const pg1 = await seedPgWorkspace(db, '서포터 B 페이');
    const pg1Admin = await seedUser(db, { email: 'admin@toss.im' });
    await seedMembership(db, pg1.id, pg1Admin.id, 'admin');

    const pg2 = await seedPgWorkspace(db, 'KG이니시스');
    const pg2Admin = await seedUser(db, { email: 'admin@inicis.com' });
    await seedMembership(db, pg2.id, pg2Admin.id, 'admin');

    const pg3 = await seedPgWorkspace(db, '카카오페이');
    const pg3Admin = await seedUser(db, { email: 'admin@kakaopay.com' });
    await seedMembership(db, pg3.id, pg3Admin.id, 'admin');

    const pgWsIds = [pg1.id, pg2.id, pg3.id];
    const adminEntries = [
      { wsId: pg1.id, userId: pg1Admin.id },
      { wsId: pg2.id, userId: pg2Admin.id },
      { wsId: pg3.id, userId: pg3Admin.id },
    ];

    const r = await createRfpAction({
      title: '결제 인프라 제안',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: pgWsIds,
      requiredPaymentMethods: ['card'],
      send: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.status).toBe('sent');
    expect(row.sentAt).not.toBeNull();

    const invs = await db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.rfpId, row.id));
    expect(invs).toHaveLength(pgWsIds.length);
    for (const inv of invs) {
      expect(inv.tokenHash).toBeTruthy();
      expect(pgWsIds).toContain(inv.pgWsId);
      expect(inv.status).toBe('pending');
    }

    // One outbox entry per admin member
    const inviteRows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.invited'));
    expect(inviteRows).toHaveLength(pgWsIds.length);
    const expectedKeys = adminEntries
      .map(({ wsId, userId }) => `rfp:${row.id}:invite:ws:${wsId}:user:${userId}`)
      .sort();
    expect(inviteRows.map((r) => r.dedupeKey).sort()).toEqual(expectedKeys);

  });

  it('inserts a new biz_profiles snapshot row (RFP-specific) without altering workspace.biz_profile_id (advisor pin 1)', async () => {
    const before = await db
      .select({ id: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, buyerWsId));
    const wsBizBefore = before[0].id;
    expect(wsBizBefore).toBe(bizId);

    const r = await createRfpAction({
      title: '스냅샷 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBe(wsBizBefore);

    // Snapshot row is its own biz_profiles id.
    const allBiz = await db.select().from(bizProfiles);
    expect(allBiz.map((b) => b.id)).toContain(rfpRow.bizProfileId);

    // 🚨 workspace.biz_profile_id must remain unchanged.
    const after = await db
      .select({ id: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, buyerWsId));
    expect(after[0].id).toBe(wsBizBefore);
  });

  it('snapshot inherits grade/source/confirmedBy from current biz_profile verbatim', async () => {
    const r = await createRfpAction({
      title: 'inherit',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBeNull();
    if (!rfpRow.bizProfileId) return;
    const [snap] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, rfpRow.bizProfileId));
    expect(snap.gradeSource).toBe('user_confirmed');
  });

  it('falls through to bizProfileId=null when workspace has no biz_profile_id (사전 제안)', async () => {
    await db
      .update(workspaces)
      .set({ bizProfileId: null })
      .where(eq(workspaces.id, buyerWsId));

    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(rfpRow.bizProfileId).toBeNull();
  });

  it('bizProfileMode=none skips biz_profiles snapshot insert', async () => {
    const r = await createRfpAction({
      title: 'pre-quote',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'none',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(rfpRow.bizProfileId).toBeNull();
  });

  it('bizProfileMode=override with neither bizNo nor grade returns INVALID_BIZ_PROFILE', async () => {
    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'override',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_BIZ_PROFILE');
  });

  it('bizProfileMode=override with gradeOverride creates new biz_profiles row', async () => {
    const r = await createRfpAction({
      title: 'override',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      bizProfileMode: 'override',
      gradeOverride: 'sme3',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(rfpRow.bizProfileId).not.toBeNull();
    if (!rfpRow.bizProfileId) return;
    const [snap] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, rfpRow.bizProfileId));
    expect(snap.grade).toBe('sme3');
    expect(snap.gradeSource).toBe('user_overridden');
    expect(snap.bizNo).toBeNull();
  });

  it('issues monotonic P-YYMM-NNNN ids within the month', async () => {
    const r1 = await createRfpAction({
      title: 'a',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    const r2 = await createRfpAction({
      title: 'b',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const seq1 = Number(r1.rfpId.slice(-4));
    const seq2 = Number(r2.rfpId.slice(-4));
    expect(seq2).toBe(seq1 + 1);
  });

  it('concurrent createRfp: atomic counter yields distinct codes (no dupe)', async () => {
    const mk = (t: string) =>
      createRfpAction({
        title: t,
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        allowedPgWorkspaceIds: [pgWsId],
      });
    const results = await Promise.allSettled([mk('x'), mk('y')]);
    const codes = results
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createRfpAction>>> =>
          r.status === 'fulfilled' && r.value.ok,
      )
      .map((r) => (r.value.ok ? r.value.rfpId : ''));
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(2); // atomic upsert → no duplicate code
  });

  it('rejects malformed input', async () => {
    const r = await createRfpAction({
      title: '',
      deadline: 'nope',
      allowedPgWorkspaceIds: [],
    });
    expect(r.ok).toBe(false);
  });

  it('Step 11 — links draft (ownerless) attachments to the new RFP', async () => {
    // Draft attachment: uploaded before the RFP exists → all owner FKs null.
    const draftAttId = randomUUID();
    await db.insert(attachments).values({
      id: draftAttId,
      name: 'rfp.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: buyerUserId,
    });
    // Foreign draft uploaded by another user — must NOT be linked.
    const otherUser = await seedUser(db, { email: 'other@x.com' });
    const foreignAttId = randomUUID();
    await db.insert(attachments).values({
      id: foreignAttId,
      name: 'rfp-other.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: otherUser.id,
    });

    const r = await createRfpAction({
      title: '첨부 link-up 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      rfpAttachmentIds: [draftAttId, foreignAttId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [rfpRow] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));

    const [own] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, draftAttId))
      .limit(1);
    expect(own?.rfpId).toBe(rfpRow.id);

    const [foreign] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, foreignAttId))
      .limit(1);
    // Cross-user guard: action's WHERE includes uploaded_by — foreign row
    // stays unlinked (rfp_id null).
    expect(foreign?.rfpId).toBeNull();
  });

  it('persists the 6 new optional fields when supplied', async () => {
    const r = await createRfpAction({
      title: '신규 필드 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      websiteUrl: 'https://supporter-b.com/',
      mainProducts: '의류',
      annualPgVolume: '10억',
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.websiteUrl).toBe('https://supporter-b.com/');
    expect(row.mainProducts).toBe('의류');
    expect(row.annualPgVolume).toBe('10억');
    expect(row.currentFeeRate).toBe('3.4%');
    expect(row.currentSettlementLimit).toBe('월 1억');
    expect(row.currentGuaranteeInsurance).toBe('3000만원');
  });

  it('도메인 형식이 아닌 websiteUrl 은 INVALID_INPUT 으로 거부한다', async () => {
    const r = await createRfpAction({
      title: '잘못된 홈페이지',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      websiteUrl: 'not-a-domain',
      send: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('빈 문자열 websiteUrl 은 허용한다 (refine empty-string accept path)', async () => {
    const r = await createRfpAction({
      title: '빈 홈페이지 허용',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      websiteUrl: '',
      send: false,
    });
    expect(r.ok).toBe(true);
  });

  it('omitting the 6 new optional fields stores NULL in DB', async () => {
    const r = await createRfpAction({
      title: '옵셔널 생략 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.websiteUrl).toBeNull();
    expect(row.mainProducts).toBeNull();
    expect(row.annualPgVolume).toBeNull();
    expect(row.currentFeeRate).toBeNull();
    expect(row.currentSettlementLimit).toBeNull();
    expect(row.currentGuaranteeInsurance).toBeNull();
  });

  it('persists currentSolution and currentSolutionDetail when supplied', async () => {
    const r = await createRfpAction({
      title: '솔루션 필드 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      currentSolution: 'self',
      currentSolutionDetail: 'ABC몰',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.currentSolution).toBe('self');
    expect(row.currentSolutionDetail).toBe('ABC몰');
  });

  it('stores NULL for currentSolution / currentSolutionDetail when omitted', async () => {
    const r = await createRfpAction({
      title: '솔루션 생략 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.currentSolution).toBeNull();
    expect(row.currentSolutionDetail).toBeNull();
  });

  it('rejects invalid currentSolution value via Zod', async () => {
    const r = await createRfpAction({
      title: 't',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentSolution: 'unknown_platform' as any,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('persists currentSettlementCycle when supplied', async () => {
    const r = await createRfpAction({
      title: '정산주기 필드 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      currentSettlementCycle: 'D+1',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.currentSettlementCycle).toBe('D+1');
  });

  it('stores NULL for currentSettlementCycle when omitted', async () => {
    const r = await createRfpAction({
      title: '정산주기 생략 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.currentSettlementCycle).toBeNull();
  });

  it('persists deliveryServicePeriod when supplied', async () => {
    const r = await createRfpAction({
      title: '배송기간 필드 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      deliveryServicePeriod: 'D+3',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.deliveryServicePeriod).toBe('D+3');
  });

  it('stores NULL for deliveryServicePeriod when omitted', async () => {
    const r = await createRfpAction({
      title: '배송기간 생략 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.deliveryServicePeriod).toBeNull();
  });

  it('persists boardVisible=false when opted out', async () => {
    const r = await createRfpAction({
      title: '게시판 노출 끔 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      boardVisible: false,
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.boardVisible).toBe(false);
  });

  it('defaults boardVisible=true when omitted', async () => {
    const r = await createRfpAction({
      title: '게시판 노출 기본값 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.boardVisible).toBe(true);
  });

  it("contractType: 'renewal' 을 전달하면 DB에 저장한다", async () => {
    const r = await createRfpAction({
      title: '갱신 계약 유형 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      contractType: 'renewal',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.contractType).toBe('renewal');
  });

  it('contractType 를 생략하면 DB에 NULL 로 저장한다', async () => {
    const r = await createRfpAction({
      title: '계약 유형 생략 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.contractType).toBeNull();
  });

  // _suppress unused import warnings
  void and;
});
