import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { rfps } from '@/lib/db/schema';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace, seedRfp } from './_seed';
import { DrizzleSigningContractRepository } from '../signing-contract';
import type { SigningContract, SigningParticipant } from '@/lib/types/signing';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

function makeContract(
  rfpId: string,
  createdBy: string,
  o?: Partial<SigningContract>,
): SigningContract {
  return {
    id: randomUUID(),
    rfpId,
    status: 'sent',
    round: 1,
    createdBy,
    createdAt: new Date().toISOString(),
    ...o,
  };
}

function makeParticipant(
  contractId: string,
  role: 'buyer' | 'pg',
  o?: Partial<SigningParticipant>,
): SigningParticipant {
  return {
    id: randomUUID(),
    contractId,
    name: role === 'buyer' ? '구매담당' : 'PG담당',
    email: `${role}@ex.com`,
    role,
    securityMethod: 'easy_cert',
    status: 'pending',
    ...o,
  };
}

async function setup() {
  const buyer = await seedUser(db);
  const buyerWs = await seedBuyerWorkspace(db);
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  return { buyer, buyerWs, pgWs, rfpId };
}

describe('DrizzleSigningContractRepository', () => {
  it('create → findById returns contract with its participants', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { providerRef: 'ct_1', snowsignTemplateId: 'tmpl_1' });
    await repo.create(c, [makeParticipant(c.id, 'buyer'), makeParticipant(c.id, 'pg')]);

    const found = await repo.findById(c.id);
    expect(found?.contract.providerRef).toBe('ct_1');
    expect(found?.contract.snowsignTemplateId).toBe('tmpl_1');
    expect(found?.participants).toHaveLength(2);
    expect(found?.participants.map((p) => p.role).sort()).toEqual(['buyer', 'pg']);
  });

  it('findByProviderRef returns the contract matching a SnowSign provider ref', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { providerRef: 'ct_webhook_1' });
    await repo.create(c, []);
    const found = await repo.findByProviderRef('ct_webhook_1');
    expect(found?.id).toBe(c.id);
    expect(found?.providerRef).toBe('ct_webhook_1');
  });

  it('findByProviderRef returns undefined for an unknown ref', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    await setup();
    expect(await repo.findByProviderRef('does-not-exist')).toBeUndefined();
  });

  it('transitionIfActive moves an active contract to a terminal state and returns true', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(c, []);
    const at = new Date('2026-03-01T00:00:00Z');
    const did = await repo.transitionIfActive(c.id, 'canceled', at, { cancelReason: '재발송' });
    expect(did).toBe(true);
    const after = await repo.findById(c.id);
    expect(after?.contract.status).toBe('canceled');
    expect(after?.contract.canceledAt).toBe(at.toISOString());
    expect(after?.contract.cancelReason).toBe('재발송');
  });

  it('transitionIfActive is a no-op (returns false) when the contract already reached a terminal state', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(c, []);
    // completed is terminal — a concurrent cancel must NOT clobber it.
    await repo.finalizeIfNotFinal(c.id, new Date());
    const did = await repo.transitionIfActive(c.id, 'canceled', new Date(), { cancelReason: 'x' });
    expect(did).toBe(false);
    expect((await repo.findById(c.id))?.contract.status).toBe('completed');
  });

  it('transitionIfActive claims exactly once under repeated calls (serialization)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'in_progress' });
    await repo.create(c, []);
    const first = await repo.transitionIfActive(c.id, 'canceled', new Date());
    const second = await repo.transitionIfActive(c.id, 'canceled', new Date());
    expect(first).toBe(true);
    expect(second).toBe(false); // already canceled — second claimant loses
  });

  it('claimForSend claims an awaiting contract exactly once (concurrent send serialization)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const now = new Date();
    const leaseBefore = new Date(now.getTime() - 120_000);
    const first = await repo.claimForSend(c.id, now, leaseBefore);
    const second = await repo.claimForSend(c.id, now, leaseBefore);

    expect(first).toBe(true);
    expect(second).toBe(false);
    // 클레임은 상태를 바꾸지 않는다 — 실패해도 카드가 계속 눌린다.
    expect((await repo.findById(c.id))!.contract.status).toBe('awaiting_pg_template');
  });

  it('claimForSend refuses a contract that already left awaiting', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(c, []);

    const now = new Date();
    expect(await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000))).toBe(false);
  });

  it('claimForSend succeeds again once the lease expires (crashed send is recoverable)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const claimedAt = new Date(Date.now() - 10 * 60_000); // 10분 전에 잡고 죽음
    expect(await repo.claimForSend(c.id, claimedAt, new Date(Date.now() - 120_000))).toBe(true);

    const now = new Date();
    expect(await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000))).toBe(true);
  });

  it('releaseSendClaim frees the row so a retry can claim immediately', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const now = new Date();
    const leaseBefore = new Date(now.getTime() - 120_000);
    expect(await repo.claimForSend(c.id, now, leaseBefore)).toBe(true);
    expect(await repo.claimForSend(c.id, now, leaseBefore)).toBe(false);

    await repo.releaseSendClaim(c.id, now);
    expect(await repo.claimForSend(c.id, now, leaseBefore)).toBe(true);
  });

  // 리스가 만료돼 B 가 정당히 재취득한 뒤, 뒤늦게 실패한 A 의 해제가 B 의 살아있는
  // 클레임을 풀어버리면 이중 발송이 열린다.
  it('releaseSendClaim does not free a lease that someone else re-claimed', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const aClaimedAt = new Date(Date.now() - 10 * 60_000); // A 가 잡고 멈춤
    expect(await repo.claimForSend(c.id, aClaimedAt, new Date(0))).toBe(true);

    const now = new Date();
    const leaseBefore = new Date(now.getTime() - 120_000);
    expect(await repo.claimForSend(c.id, now, leaseBefore)).toBe(true); // B 가 재취득

    await repo.releaseSendClaim(c.id, aClaimedAt); // A 가 뒤늦게 해제 시도
    // B 의 클레임은 살아 있어야 한다 — 제3의 클릭이 들어와도 못 잡는다.
    expect(await repo.claimForSend(c.id, now, leaseBefore)).toBe(false);
  });

  it('findStaleAwaiting returns old awaiting contracts that were not recently nudged', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const stale = makeContract(rfpId, buyer.id, {
      status: 'awaiting_pg_template',
      createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    });
    await repo.create(stale, []);
    const cutoff = new Date('2026-02-01T00:00:00Z');
    expect((await repo.findStaleAwaiting(cutoff, 10)).map((c) => c.id)).toContain(stale.id);
  });

  it('findStaleAwaiting excludes a recently-nudged awaiting contract (throttle)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, {
      status: 'awaiting_pg_template',
      createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      lastPolledAt: new Date('2026-02-15T00:00:00Z').toISOString(), // nudged after the cutoff
    });
    await repo.create(c, []);
    const cutoff = new Date('2026-02-01T00:00:00Z');
    expect(await repo.findStaleAwaiting(cutoff, 10)).toHaveLength(0);
  });

  it('only one ACTIVE contract per RFP (partial unique)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    await repo.create(makeContract(rfpId, buyer.id, { status: 'sent' }), []);
    await expect(
      repo.create(makeContract(rfpId, buyer.id, { status: 'sent' }), []),
    ).rejects.toBeDefined();
  });

  it('completing frees the RFP for a new round (re-send)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const first = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(first, []);
    expect((await repo.findActiveByRfp(rfpId))?.id).toBe(first.id);

    await repo.patchContract(first.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    expect(await repo.findActiveByRfp(rfpId)).toBeUndefined();

    const second = makeContract(rfpId, buyer.id, { status: 'sent', round: 2 });
    await repo.create(second, []);
    expect((await repo.findActiveByRfp(rfpId))?.round).toBe(2);
    expect(await repo.findByRfp(rfpId)).toHaveLength(2);
  });

  it('deleting the RFP cascades to contract + participants', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id);
    await repo.create(c, [makeParticipant(c.id, 'buyer')]);
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    expect(await repo.findById(c.id)).toBeUndefined();
  });

  it('findPollable returns sent/in_progress, excludes terminal', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, buyerWs } = await setup();
    const rfpA = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0201' });
    const rfpB = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0202' });
    const rfpC = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0203' });
    await repo.create(makeContract(rfpA.id, buyer.id, { status: 'sent' }), []);
    await repo.create(makeContract(rfpB.id, buyer.id, { status: 'in_progress' }), []);
    await repo.create(
      makeContract(rfpC.id, buyer.id, { status: 'completed', completedAt: new Date().toISOString() }),
      [],
    );

    const pollable = await repo.findPollable(10);
    expect(pollable.map((c) => c.status).sort()).toEqual(['in_progress', 'sent']);
  });

  it('patchParticipant updates status + signedAt', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id);
    const p = makeParticipant(c.id, 'buyer');
    await repo.create(c, [p]);
    const signedAt = new Date();
    await repo.patchParticipant(p.id, { status: 'signed', signedAt: signedAt.toISOString() });
    const found = await repo.findById(c.id);
    expect(found?.participants[0]!.status).toBe('signed');
    expect(found?.participants[0]!.signedAt).toBe(signedAt.toISOString());
  });

  // 하트비트 — 패널이 열려 있는 동안 리스를 계속 살려 둔다. 리스를 짧게(5분) 가져가면서
  // 탭 닫기·크래시·이탈을 "핑이 멎음" 하나로 수렴시키기 위한 primitive.
  it('renewSendClaim extends only the holder\'s own claim', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const t0 = new Date('2026-08-01T12:00:00.000Z');
    expect(await repo.claimForSend(c.id, t0, new Date(t0.getTime() - 300_000))).toBe(true);

    const t1 = new Date('2026-08-01T12:01:00.000Z');
    expect(await repo.renewSendClaim(c.id, t0, t1)).toBe(true);

    // 리스 값은 도메인 타입에 노출하지 않는 내부 동시성 상태라, 저장값을 들여다보는
    // 대신 행동으로 확인한다: 이제 유효한 토큰은 t1 뿐이다.
    expect(await repo.renewSendClaim(c.id, t0, new Date('2026-08-01T12:02:00.000Z'))).toBe(false);
    expect(await repo.renewSendClaim(c.id, t1, new Date('2026-08-01T12:02:00.000Z'))).toBe(true);
  });

  it('renewSendClaim refuses when someone else holds the claim', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const mine = new Date('2026-08-01T12:00:00.000Z');
    const theirs = new Date('2026-08-01T12:10:00.000Z');
    await repo.claimForSend(c.id, theirs, new Date(theirs.getTime() - 300_000));

    // 내 토큰은 이미 남의 것으로 대체됐다 — 연장 실패로 내 세션이 멎어야 한다.
    expect(await repo.renewSendClaim(c.id, mine, new Date('2026-08-01T12:11:00.000Z'))).toBe(false);
    // 그리고 남의 리스는 멀쩡히 살아 있어야 한다(내 실패가 남을 건드리지 않았다).
    expect(await repo.renewSendClaim(c.id, theirs, new Date('2026-08-01T12:11:00.000Z'))).toBe(true);
  });

  it('renewSendClaim refuses once the contract left awaiting', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const t0 = new Date('2026-08-01T12:00:00.000Z');
    await repo.claimForSend(c.id, t0, new Date(t0.getTime() - 300_000));
    await repo.markSentIfAwaiting(c.id, { providerRef: 'ct_1', sentAt: new Date().toISOString() });

    expect(await repo.renewSendClaim(c.id, t0, new Date('2026-08-01T12:01:00.000Z'))).toBe(false);
  });

  // 같은 스노우싸인 계약을 두 행이 쥐면 상태·완료본이 서로를 덮어쓰고, 한쪽 딜룸은
  // 영영 낡은 상태에 갇힌다(reconcileByProviderRef 가 limit(1) 이라 한 행만 본다).
  // 서비스의 findByProviderRef 검사는 read-then-write 라 동시 요청 둘 다 통과한다 —
  // 선착순을 실제로 정하는 건 DB 제약이어야 한다.
  it('rejects a second contract bound to the same provider_ref', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const a = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(a, []);
    await repo.markSentIfAwaiting(a.id, { providerRef: 'ct_dup', sentAt: new Date().toISOString() });

    // 두 번째 계약 행(다른 RFP)이 같은 provider 계약을 쥐려 한다.
    const { buyer: buyer2, rfpId: rfpId2 } = await setup();
    const b = makeContract(rfpId2, buyer2.id, { status: 'awaiting_pg_template' });
    await repo.create(b, []);
    await expect(
      repo.markSentIfAwaiting(b.id, { providerRef: 'ct_dup', sentAt: new Date().toISOString() }),
    ).rejects.toThrow();
  });

  // 제약은 부분 유니크여야 한다 — 아직 발송 전인 계약은 provider_ref 가 전부 NULL 이고,
  // 평범한 UNIQUE 면 두 번째 대기 행부터 생성이 막힌다.
  it('allows many contracts with a null provider_ref', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const one = await setup();
    const two = await setup();
    await repo.create(makeContract(one.rfpId, one.buyer.id, { status: 'awaiting_pg_template' }), []);
    await repo.create(makeContract(two.rfpId, two.buyer.id, { status: 'awaiting_pg_template' }), []);
    expect(await repo.findActiveByRfp(two.rfpId)).toBeTruthy();
  });
});
