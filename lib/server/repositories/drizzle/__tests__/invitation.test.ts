import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import { rfpInvitations, rfps } from '@/lib/db/schema';
import { DrizzleInvitationRepository } from '../invitation';
import { generateToken, addMinutes, hashToken } from '../../../token';
import type { RfpInvitation } from '@/lib/types/invitation';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const buyer = await seedUser(db);
  const biz = await seedBizProfile(db);
  const ws = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, '서포터 B 페이');
  // Insert one RFP to FK against.
  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0001',
    buyerWsId: ws.id,
    bizProfileId: biz.id,
    title: 'T',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
  });
  const repo = new DrizzleInvitationRepository(db);
  return { db, repo, buyer, ws, biz, pgWs, rfpId };
}

function makeInvitation(rfpId: string, pgWsId: string, overrides?: Partial<RfpInvitation>): RfpInvitation {
  return {
    id: randomUUID(),
    rfpId,
    pgWsId,
    uniqueToken: 'placeholder',
    sentAt: new Date().toISOString(),
    expiresAt: addMinutes(new Date(), 7 * 24 * 60),
    status: 'sent',
    ...overrides,
  };
}

describe('DrizzleInvitationRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleInvitationRepository;

  beforeEach(async () => {
    ctx = await setup();
    repo = ctx.repo;
  });

  it('claims a valid token and sets acceptedByUserId', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    const claimer = await seedUser(ctx.db, { email: 'pg-1@toss.im' });

    const result = await repo.claimToken(raw, claimer.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invitation.acceptedByUserId).toBe(claimer.id);
      expect(result.invitation.status).toBe('accepted');
    }
  });

  it('returns invalid for unknown token', async () => {
    const claimer = await seedUser(ctx.db);
    const result = await repo.claimToken('unknown-' + Date.now(), claimer.id);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns expired for past expiresAt', async () => {
    const raw = generateToken();
    await repo.save(
      makeInvitation(ctx.rfpId, ctx.pgWs.id, { expiresAt: new Date(Date.now() - 1000).toISOString() }),
      raw,
    );
    const claimer = await seedUser(ctx.db);
    expect(await repo.claimToken(raw, claimer.id)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('second claim returns used', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    const a = await seedUser(ctx.db, { email: 'a@toss.im' });
    const b = await seedUser(ctx.db, { email: 'b@toss.im' });
    await repo.claimToken(raw, a.id);
    expect(await repo.claimToken(raw, b.id)).toEqual({ ok: false, reason: 'used' });
  });

  it('canAccess passes any member of the invited PG workspace', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    // canAccess is keyed by pgWsId — any member of the invited ws passes,
    // regardless of who (or whether anyone) claimed the token.
    expect(await repo.canAccess(ctx.rfpId, ctx.pgWs.id)).toBe(true);

    const otherPgWs = await seedPgWorkspace(ctx.db, '이니시스');
    expect(await repo.canAccess(ctx.rfpId, otherPgWs.id)).toBe(false);
  });

  it('canAccess remains true after claim transitions invitation to accepted/opened', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    const accepter = await seedUser(ctx.db, { email: 'sales@toss.im' });
    await repo.claimToken(raw, accepter.id);
    expect(await repo.canAccess(ctx.rfpId, ctx.pgWs.id)).toBe(true);
  });

  it('findByPgWorkspace includes the buyer workspace name', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    const pairs = await repo.findByPgWorkspace(ctx.pgWs.id);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.buyerName).toBe('구매사');
  });

  it('markOpened transitions pending → opened (non-claimer first visit) and is idempotent', async () => {
    const raw = generateToken();
    const inv = makeInvitation(ctx.rfpId, ctx.pgWs.id);
    await repo.save(inv, raw);

    // Pre-claim ('sent' / DB pending) — first ws-member visit advances kanban.
    await repo.markOpened(inv.id, new Date());
    let [row] = await ctx.db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, inv.id));
    expect(row.status).toBe('opened');
    const firstOpenedAt = row.openedAt;

    // Second visit by another member — idempotent (no overwrite of openedAt).
    await new Promise((r) => setTimeout(r, 5));
    await repo.markOpened(inv.id, new Date());
    [row] = await ctx.db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, inv.id));
    expect(row.status).toBe('opened');
    expect(row.openedAt).toEqual(firstOpenedAt);
  });

  it('parallel claimToken: one wins, the other returns used (atomic UPDATE WHERE)', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), raw);
    const a = await seedUser(ctx.db, { email: 'a@toss.im' });
    const b = await seedUser(ctx.db, { email: 'b@toss.im' });

    const settled = await Promise.allSettled([
      repo.claimToken(raw, a.id),
      repo.claimToken(raw, b.id),
    ]);
    const results = settled
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof repo.claimToken>>> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value);
    const oks = results.filter((r) => r.ok);
    const useds = results.filter((r) => !r.ok && r.reason === 'used');
    expect(oks).toHaveLength(1);
    expect(useds).toHaveLength(1);
  });

  it('findByRfp returns invitations for the RFP', async () => {
    const pgWs2 = await seedPgWorkspace(ctx.db, '이니시스');
    const r1 = generateToken();
    const r2 = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), r1);
    await repo.save(makeInvitation(ctx.rfpId, pgWs2.id), r2);
    const list = await repo.findByRfp(ctx.rfpId);
    expect(list).toHaveLength(2);
  });

  it('findByTokenHash returns the row before claim', async () => {
    const raw = generateToken();
    const inv = makeInvitation(ctx.rfpId, ctx.pgWs.id);
    await repo.save(inv, raw);

    const found = await repo.findByTokenHash(hashToken(raw));
    expect(found).toBeDefined();
    expect(found!.id).toBe(inv.id);
    expect(found!.pgWsId).toBe(ctx.pgWs.id);
    expect(found!.acceptedByUserId).toBeUndefined();

    // Unknown hash → undefined.
    const missing = await repo.findByTokenHash(hashToken('nope-' + Date.now()));
    expect(missing).toBeUndefined();
  });

  it('findByPgWorkspace returns active invitation+RFP pairs for the ws regardless of claim state', async () => {
    const pgWs2 = await seedPgWorkspace(ctx.db, '이니시스');
    const r1 = generateToken();
    const r2 = generateToken();
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), r1);
    await repo.save(makeInvitation(ctx.rfpId, pgWs2.id), r2);

    // Neither claimed yet — both 'sent' (DB: pending). findByPgWorkspace must
    // include them so the inbox/kanban surface invitations to ws members
    // before anyone clicks the email token link.
    const tossPairs = await repo.findByPgWorkspace(ctx.pgWs.id);
    expect(tossPairs).toHaveLength(1);
    expect(tossPairs[0].invitation.pgWsId).toBe(ctx.pgWs.id);

    const inicisPairs = await repo.findByPgWorkspace(pgWs2.id);
    expect(inicisPairs).toHaveLength(1);
    expect(inicisPairs[0].invitation.pgWsId).toBe(pgWs2.id);

    // After claim, the row is still surfaced (status flips to 'accepted').
    const userA = await seedUser(ctx.db, { email: 'a@toss.im' });
    await repo.claimToken(r1, userA.id);
    const tossPairsAfter = await repo.findByPgWorkspace(ctx.pgWs.id);
    expect(tossPairsAfter).toHaveLength(1);
    expect(tossPairsAfter[0].invitation.acceptedByUserId).toBe(userA.id);
  });

  it('findByPgWorkspace: rfp.contractType이 DB 값으로 반환된다', async () => {
    // RFP를 contractType='renewal'로 직접 INSERT
    const rfpId2 = randomUUID();
    await ctx.db.insert(rfps).values({
      id: rfpId2,
      code: 'P-2605-CTYPE',
      buyerWsId: ctx.ws.id,
      bizProfileId: ctx.biz.id,
      title: 'Renewal RFP',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: ctx.buyer.id,
      contractType: 'renewal',
    });
    await repo.save(makeInvitation(rfpId2, ctx.pgWs.id), generateToken());

    const pairs = await repo.findByPgWorkspace(ctx.pgWs.id);
    const pair = pairs.find((p) => p.rfp.code === 'P-2605-CTYPE');
    expect(pair).toBeDefined();
    expect(pair!.rfp.contractType).toBe('renewal');
  });

  it('findByRfpIds: 여러 RFP의 invitation을 rfpId별 Map으로 그룹화', async () => {
    // 두 번째 RFP(같은 ws) 생성.
    const rfp2 = randomUUID();
    await ctx.db.insert(rfps).values({
      id: rfp2,
      code: 'P-2605-0002',
      buyerWsId: ctx.ws.id,
      bizProfileId: ctx.biz.id,
      title: 'T2',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: ctx.buyer.id,
    });
    const pgWs2 = await seedPgWorkspace(ctx.db, '이니시스');
    // rfp1: 초대 2개(toss, inicis), rfp2: 초대 1개(toss).
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), generateToken());
    await repo.save(makeInvitation(ctx.rfpId, pgWs2.id), generateToken());
    await repo.save(makeInvitation(rfp2, ctx.pgWs.id), generateToken());

    const map = await repo.findByRfpIds([ctx.rfpId, rfp2]);

    expect(map.get(ctx.rfpId)).toHaveLength(2);
    expect(map.get(ctx.rfpId)!.every((i) => i.rfpId === ctx.rfpId)).toBe(true);
    expect(map.get(rfp2)).toHaveLength(1);
    expect(map.get(rfp2)![0].pgWsId).toBe(ctx.pgWs.id);
  });

  it('findByRfpIds: 빈 입력 → 빈 Map', async () => {
    const map = await repo.findByRfpIds([]);
    expect(map.size).toBe(0);
  });
});

describe('InvitationRepo.findByRfpAndPg', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleInvitationRepository;
  beforeEach(async () => { ctx = await setup(); repo = ctx.repo; });

  it('returns undefined when no invitation exists for the pair', async () => {
    const result = await repo.findByRfpAndPg(ctx.rfpId, ctx.pgWs.id);
    expect(result).toBeUndefined();
  });

  it('returns the invitation regardless of status', async () => {
    await repo.save(makeInvitation(ctx.rfpId, ctx.pgWs.id), generateToken());
    const result = await repo.findByRfpAndPg(ctx.rfpId, ctx.pgWs.id);
    expect(result).toBeDefined();
    expect(result!.pgWsId).toBe(ctx.pgWs.id);
    expect(result!.rfpId).toBe(ctx.rfpId);
  });

  it('returns draft invitation by (rfpId, pgWsId)', async () => {
    const invId = randomUUID();
    await repo.saveDraft(invId, ctx.rfpId, ctx.pgWs.id, new Date(Date.now() + 86_400_000));
    const result = await repo.findByRfpAndPg(ctx.rfpId, ctx.pgWs.id);
    expect(result).toBeDefined();
    expect(result!.status).toBe('draft');
  });
});

describe('InvitationRepo.saveDraft', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleInvitationRepository;
  beforeEach(async () => { ctx = await setup(); repo = ctx.repo; });

  it('inserts row with status=draft and tokenHash=draft-{id}', async () => {
    const invId = randomUUID();
    await repo.saveDraft(invId, ctx.rfpId, ctx.pgWs.id, new Date(Date.now() + 86_400_000));
    const [row] = await ctx.db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, invId));
    expect(row).toBeDefined();
    expect(row!.status).toBe('draft');
    expect(row!.tokenHash).toBe(`draft-${invId}`);
    expect(row!.pgWsId).toBe(ctx.pgWs.id);
  });
});

describe('InvitationRepo.promoteDraft', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let repo: DrizzleInvitationRepository;
  beforeEach(async () => { ctx = await setup(); repo = ctx.repo; });

  it('updates tokenHash and transitions draft → pending', async () => {
    const invId = randomUUID();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await repo.saveDraft(invId, ctx.rfpId, ctx.pgWs.id, expiresAt);
    const rawToken = generateToken();
    const now = new Date();
    await repo.promoteDraft(invId, rawToken, now, expiresAt);
    const [row] = await ctx.db
      .select()
      .from(rfpInvitations)
      .where(eq(rfpInvitations.id, invId));
    expect(row!.status).toBe('pending');
    expect(row!.tokenHash).toBe(hashToken(rawToken));
    expect(row!.tokenHash).not.toMatch(/^draft-/);
  });
});
