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
import { migrateCurrentTerms, STRIP_PATH_FEE_RATE, SOLUTION_VALUES } from '@/lib/types/rfp-terms';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/types/bid';
import { MAX_FILES } from '@/lib/server/storage/constants';

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

  describe('send=true 신규 필수 필드 (견적 유형·주요 판매 상품·연간 거래액)', () => {
    const base = () => ({
      title: '신규 필수 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['card' as const],
      websiteUrl: 'example.com',
      contractType: 'new' as const,
      mainProducts: '의류',
      annualPgVolume: '1000000000',
      send: true,
    });

    it('모든 필수 필드를 채우면 발송 성공', async () => {
      const r = await createRfpAction(base());
      expect(r.ok).toBe(true);
    });

    it('견적 유형 미선택이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), contractType: undefined });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('견적 유형이 null이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), contractType: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('주요 판매 상품이 비면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), mainProducts: '' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('주요 판매 상품이 공백뿐이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), mainProducts: '   ' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('갱신 계약에서 연간 PG 총 거래액이 비면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), contractType: 'renewal', annualPgVolume: '' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('갱신 계약에서 연간 PG 총 거래액이 공백뿐이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({ ...base(), contractType: 'renewal', annualPgVolume: '   ' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('갱신 계약에서 연간 PG 총 거래액이 0이면 INVALID_INPUT (양수 필수)', async () => {
      const r = await createRfpAction({ ...base(), contractType: 'renewal', annualPgVolume: '0' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('신규 계약은 연간 PG 총 거래액이 비어도 발송 성공 (존재할 수 없는 값 필수 제외)', async () => {
      const r = await createRfpAction({ ...base(), contractType: 'new', annualPgVolume: '' });
      expect(r.ok).toBe(true);
    });

    it('draft(send=false)는 세 필드가 비어도 통과', async () => {
      const r = await createRfpAction({
        ...base(),
        contractType: undefined,
        mainProducts: '',
        annualPgVolume: '',
        send: false,
      });
      expect(r.ok).toBe(true);
    });
  });

  it('logs an rfp.sent business event on send', async () => {
    const r = await createRfpAction({
      title: '로그 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['card'],
      websiteUrl: 'example.com',
      contractType: 'new',
      mainProducts: '의류',
      annualPgVolume: '1000000000',
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

  it('첨부 파일 개수가 상한을 넘으면 INVALID_INPUT이다', async () => {
    const r = await createRfpAction({
      title: '첨부 상한 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [],
      rfpAttachmentIds: Array.from({ length: MAX_FILES + 1 }, () => randomUUID()),
      send: false,
    });

    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('첨부 파일 개수가 정확히 상한이면 허용한다', async () => {
    const ids = Array.from({ length: MAX_FILES }, () => randomUUID());
    await db.insert(attachments).values(ids.map((id, index) => ({
      id,
      name: `${index + 1}.pdf`,
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: buyerUserId,
    })));

    const r = await createRfpAction({
      title: '첨부 상한 경계 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [],
      rfpAttachmentIds: ids,
      send: false,
    });

    expect(r.ok).toBe(true);
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

  it('apple_pay·samsung_pay 도 유효한 결제수단으로 허용한다', async () => {
    const r = await createRfpAction({
      title: '애플페이 삼성페이 결제수단',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['apple_pay', 'samsung_pay'],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.requiredPaymentMethods).toEqual(['apple_pay', 'samsung_pay']);
  });

  // 회귀 가드 — 결제수단 어휘도 이제 z.enum(PAYMENT_METHODS) 로 파생한다(과거엔 액션 안에
  // 배열을 손으로 복제했다). 어휘 일치는 구조적으로 보장되므로 여기서 고정하는 건 캐논니컬
  // 목록 전체가 액션 끝까지 실제로 통과하는지다. 순회 소스로 PAYMENT_METHOD_LABELS 를 쓰는
  // 이유는 Record<PaymentMethod,_> 라 컴파일러가 유니온 전체를 강제하기 때문(카테고리 배열은
  // 배치 누락이 있으면 조용히 빠진다).
  it.each(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])(
    '%s — PAYMENT_METHODS 배열 드리프트 가드 (캐논니컬 목록 전체 허용)',
    async (method) => {
      const r = await createRfpAction({
        title: '결제수단 드리프트 가드',
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        allowedPgWorkspaceIds: [pgWsId],
        requiredPaymentMethods: [method],
        send: false,
      });
      expect(r.ok).toBe(true);
    },
  );

  // 회귀 가드 — currentSolution 은 이제 z.enum(SOLUTION_VALUES) 로 파생하므로 어휘 자체는
  // 구조적으로 어긋날 수 없다. 여기서 고정하는 건 그 아래 계층이다: 캐논니컬 어휘의 모든
  // 값이 superRefine·서비스까지 실제로 통과하는지(그리고 누군가 인라인 리터럴로 되돌리면
  // 깨지는지). 어긋나면 위저드에서 고른 솔루션이 서버에서 조용히 INVALID_INPUT 이 된다.
  it.each([...SOLUTION_VALUES])(
    '%s — currentSolution 드리프트 가드 (캐논니컬 어휘 전체 허용)',
    async (solution) => {
      const r = await createRfpAction({
        title: '솔루션 드리프트 가드',
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        allowedPgWorkspaceIds: [pgWsId],
        requiredPaymentMethods: ['card'],
        currentSolution: solution,
        send: false,
      });
      expect(r.ok).toBe(true);
    },
  );

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
      websiteUrl: 'example.com',
      contractType: 'new',
      mainProducts: '의류',
      annualPgVolume: '1000000000',
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
      websiteUrl: 'example.com',
      contractType: 'new',
      mainProducts: '의류',
      annualPgVolume: '1000000000',
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
    expect(r).toEqual({ ok: false, error: 'INVALID_ATTACHMENT' });

    const rfpRows = await db.select().from(rfps).where(eq(rfps.title, '첨부 link-up 테스트'));
    expect(rfpRows).toHaveLength(0);

    const [own] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, draftAttId))
      .limit(1);
    expect(own?.rfpId).toBeNull();

    const [foreign] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, foreignAttId))
      .limit(1);
    expect(foreign?.rfpId).toBeNull();
  });

  it('persists the 6 new optional fields when supplied', async () => {
    const r = await createRfpAction({
      title: '신규 필드 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      websiteUrl: 'https://support-b.com/',
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
    const terms = migrateCurrentTerms(row.currentTerms);
    expect(row.websiteUrl).toBe('https://support-b.com/');
    expect(row.mainProducts).toBe('의류');
    expect(terms.annualPgVolume).toBe('10억');
    expect(terms.feeRate).toBe('3.4%');
    expect(terms.settlementLimit).toBe('월 1억');
    expect(terms.guaranteeInsurance).toBe('3000만원');
  });

  it('신규 계약이면 PG 이력 5개 필드를 넘겨도 current_terms 에 저장하지 않는다 (서버 strip)', async () => {
    const r = await createRfpAction({
      title: '신규 계약 strip 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      contractType: 'new',
      // 탈취 draft·직접 호출 시나리오 — 신규 계약에 존재할 수 없는 PG 이력 값을 함께 전달
      annualPgVolume: '1000000000',
      currentFeeRate: '3.4%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
      currentSettlementCycle: 'D+1',
      // PG 무관 사업 속성 — 신규에서도 보존되어야 한다
      deliveryServicePeriod: 'D+3',
      currentSolution: 'self',
      currentSolutionDetail: 'ABC몰',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    const terms = migrateCurrentTerms(row.currentTerms);
    // 존재할 수 없는 값 → strip (문서에 부재)
    expect(terms.annualPgVolume).toBeUndefined();
    expect(terms.feeRate).toBeUndefined();
    expect(terms.settlementLimit).toBeUndefined();
    expect(terms.guaranteeInsurance).toBeUndefined();
    expect(terms.settlementCycle).toBeUndefined();
    // fee 공개 경로도 남지 않는다 (수수료 자체가 없으므로)
    expect(row.hiddenFromPg ?? []).not.toContain(STRIP_PATH_FEE_RATE);
    // 사업 속성은 보존
    expect(terms.deliveryServicePeriod).toBe('D+3');
    expect(terms.solution).toBe('self');
    expect(terms.solutionDetail).toBe('ABC몰');
  });

  it('신규 계약이면 PG 비공개(currentFeeVisibleToPg=false)여도 hiddenFromPg 에 fee 경로를 남기지 않는다', async () => {
    // 갱신에서 수수료 비공개로 설정하다 신규로 전환한 시나리오 — 수수료가 strip 되므로
    // 존재하지 않는 fee 를 가리키는 orphan strip 경로가 남으면 안 된다.
    const r = await createRfpAction({
      title: '신규 계약 fee 가시성 strip 검증',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      contractType: 'new',
      currentFeeRate: '3.4%',
      currentFeeVisibleToPg: false,
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.hiddenFromPg ?? []).not.toContain(STRIP_PATH_FEE_RATE);
    expect(migrateCurrentTerms(row.currentTerms).feeRate).toBeUndefined();
  });

  it('스킴 없는 websiteUrl 은 https:// 를 붙여 저장한다', async () => {
    const r = await createRfpAction({
      title: '스킴 없는 홈페이지 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      websiteUrl: 'example.com',
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.websiteUrl).toBe('https://example.com');
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
    const terms = migrateCurrentTerms(row.currentTerms);
    expect(row.websiteUrl).toBeNull();
    expect(row.mainProducts).toBeNull();
    expect(terms.annualPgVolume).toBeUndefined();
    expect(terms.feeRate).toBeUndefined();
    expect(terms.settlementLimit).toBeUndefined();
    expect(terms.guaranteeInsurance).toBeUndefined();
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
    const terms = migrateCurrentTerms(row.currentTerms);
    expect(terms.solution).toBe('self');
    expect(terms.solutionDetail).toBe('ABC몰');
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
    const terms = migrateCurrentTerms(row.currentTerms);
    expect(terms.solution).toBeUndefined();
    expect(terms.solutionDetail).toBeUndefined();
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
    expect(migrateCurrentTerms(row.currentTerms).settlementCycle).toBe('D+1');
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
    expect(migrateCurrentTerms(row.currentTerms).settlementCycle).toBeUndefined();
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
    expect(migrateCurrentTerms(row.currentTerms).deliveryServicePeriod).toBe('D+3');
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
    expect(migrateCurrentTerms(row.currentTerms).deliveryServicePeriod).toBeUndefined();
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

  it('persists currentFeeVisibleToPg=false when opted out', async () => {
    const r = await createRfpAction({
      title: '현재 수수료 비공개 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      currentFeeRate: '3.4%',
      currentFeeVisibleToPg: false,
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    // 비공개 = hidden_from_pg 에 feeRate 경로 포함.
    expect(row.hiddenFromPg).toContain(STRIP_PATH_FEE_RATE);
    // 값 자체는 항상 문서에 저장된다 (구매사 비교 baseline 보존).
    expect(migrateCurrentTerms(row.currentTerms).feeRate).toBe('3.4%');
  });

  it('defaults currentFeeVisibleToPg=true when omitted', async () => {
    const r = await createRfpAction({
      title: '현재 수수료 공개 기본값 테스트',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
    expect(row.hiddenFromPg).not.toContain(STRIP_PATH_FEE_RATE);
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

  it('send=true이고 websiteUrl 비면 결과가 ok:false', async () => {
    const pg = await seedPgWorkspace(db, '홈페이지검증PG');
    const pgAdmin = await seedUser(db, { email: 'admin@homepage.test' });
    await seedMembership(db, pg.id, pgAdmin.id, 'admin');

    const r = await createRfpAction({
      title: '홈페이지 누락 발송',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pg.id],
      requiredPaymentMethods: ['card'],
      websiteUrl: '',
      send: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('send=false이면 websiteUrl 비어도 통과', async () => {
    const r = await createRfpAction({
      title: '드래프트 홈페이지 없음',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      requiredPaymentMethods: ['card'],
      websiteUrl: '',
      send: false,
    });
    expect(r.ok).toBe(true);
  });

  it('send=true이고 형식 오류 websiteUrl → ok:false', async () => {
    const pg = await seedPgWorkspace(db, '형식오류PG');
    const pgAdmin = await seedUser(db, { email: 'admin@format.test' });
    await seedMembership(db, pg.id, pgAdmin.id, 'admin');

    const r = await createRfpAction({
      title: '형식 오류 홈페이지 발송',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pg.id],
      requiredPaymentMethods: ['card'],
      websiteUrl: 'not-a-domain',
      send: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('send=true 이고 경량검증 통과·정밀검증 실패 websiteUrl → INVALID_WEBSITE', async () => {
    const pg = await seedPgWorkspace(db, '가짜TLD_PG');
    const pgAdmin = await seedUser(db, { email: 'admin@faketld.test' });
    await seedMembership(db, pg.id, pgAdmin.id, 'admin');

    const r = await createRfpAction({
      title: '가짜 TLD 홈페이지 발송',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pg.id],
      requiredPaymentMethods: ['card'],
      websiteUrl: 'foo.invalidtld',
      send: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_WEBSITE');
  });

  // _suppress unused import warnings
  void and;

  it('invite outbox HTML uses the partner host when NEXT_PUBLIC_PARTNER_ORIGIN is set', async () => {
    const savedPartner = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.support-b.com';
    try {
      const pg = await seedPgWorkspace(db, 'PartnerHostPG');
      const pgAdmin = await seedUser(db, { email: 'admin@partnerhost.test' });
      await seedMembership(db, pg.id, pgAdmin.id, 'admin');

      const r = await createRfpAction({
        title: '파트너 호스트 초대 테스트',
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        allowedPgWorkspaceIds: [pg.id],
        requiredPaymentMethods: ['card'],
        websiteUrl: 'example.com',
        contractType: 'new',
        mainProducts: '의류',
        annualPgVolume: '1000000000',
        send: true,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const inviteRows = await db
        .select({ html: outboxEntries.html })
        .from(outboxEntries)
        .where(eq(outboxEntries.event, 'rfp.invited'));
      expect(inviteRows).toHaveLength(1);
      expect(inviteRows[0].html).toContain('https://partner.support-b.com/invite/rfp/');
    } finally {
      if (savedPartner === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
      else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner;
    }
  });

  // allowedPgWorkspaceIds(.max(50))·customPaymentMethods(.max(20)) 와 달리
  // requiredPaymentMethods 에는 개수 상한이 없어, 같은 값을 대량 중복 제출해도
  // zod 를 통과해 rfps.required_payment_methods(text[]) 에 그대로 저장됐다.
  describe('requiredPaymentMethods — 개수 상한·중복 제거', () => {
    const base = () => ({
      title: '결제수단 상한',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false as const,
    });

    it('캐논니컬 개수를 넘는 배열은 INVALID_INPUT', async () => {
      const r = await createRfpAction({
        ...base(),
        requiredPaymentMethods: Array.from(
          { length: PAYMENT_METHODS.length + 1 },
          () => 'card' as const,
        ),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('캐논니컬 어휘 전체(중복 없음)는 그대로 통과한다', async () => {
      const r = await createRfpAction({
        ...base(),
        requiredPaymentMethods: [...PAYMENT_METHODS],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
      expect(row.requiredPaymentMethods).toEqual([...PAYMENT_METHODS]);
    });

    it('중복 값은 순서를 보존한 채 하나로 접힌다', async () => {
      const r = await createRfpAction({
        ...base(),
        requiredPaymentMethods: ['card', 'bank_transfer', 'card'],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const [row] = await db.select().from(rfps).where(eq(rfps.code, r.rfpId));
      expect(row.requiredPaymentMethods).toEqual(['card', 'bank_transfer']);
    });
  });

  // 캐논니컬 어휘가 통과하는지는 위 순회 가드가 고정한다. 여기서 고정하는 건
  // 반대 방향 — 어휘 밖 값이 실제로 거부되는지다. 지금은 z.enum 의 기본 동작에만
  // 기대고 있어서, 누가 z.string() 으로 느슨하게 바꿔도 아무 테스트도 깨지지 않는다.
  describe('어휘 밖 입력 거부', () => {
    const base = () => ({
      title: '어휘 밖 입력',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      allowedPgWorkspaceIds: [pgWsId],
      send: false as const,
    });

    it('requiredPaymentMethods 에 어휘 밖 값이 있으면 INVALID_INPUT', async () => {
      const r = await createRfpAction({
        ...base(),
        requiredPaymentMethods: ['card', 'bitcoin'] as unknown as PaymentMethod[],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('currentSolution 이 어휘 밖이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({
        ...base(),
        currentSolution: 'wordpress' as never,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('gradeOverride 가 어휘 밖이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({
        ...base(),
        gradeOverride: 'platinum' as never,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });

    it('contractType 이 어휘 밖이면 INVALID_INPUT', async () => {
      const r = await createRfpAction({
        ...base(),
        contractType: 'extension' as never,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    });
  });
});
