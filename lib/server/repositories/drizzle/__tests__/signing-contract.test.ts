import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { rfps, signingContracts } from '@/lib/db/schema';
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
    const first = await repo.claimForSend(c.id, now, leaseBefore, buyer.id);
    const second = await repo.claimForSend(c.id, now, leaseBefore, buyer.id);

    expect(first).toBe(true);
    expect(second).toBe(false);
    // 클레임은 상태를 바꾸지 않는다 — 실패해도 카드가 계속 눌린다.
    expect((await repo.findById(c.id))!.contract.status).toBe('awaiting_pg_template');
  });

  // ── bindDraftRef — 발송 전 초안 핸들의 유일한 쓰기 경로 ────────────────────
  // ref 와 출처가 갈리면 다음 재시도가 남의 초안을 자기 것으로 오분류해 **다른
  // 계약서를 발송한다**. 그래서 한 UPDATE 이고, CAS 로 덮어쓰기를 물리적으로 막는다.

  it('bindDraftRef 는 provider_ref 가 비어 있을 때만 성공한다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const first = await repo.bindDraftRef(c.id, {
      origin: 'template',
      providerRef: 'c_first',
      snowsignTemplateId: 'sst_1',
    });
    // 낡은 스냅샷을 든 두 번째 라이터 — 이기면 c_first 가 취소 핸들을 잃는다.
    const second = await repo.bindDraftRef(c.id, {
      origin: 'template',
      providerRef: 'c_second',
      snowsignTemplateId: 'sst_1',
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await repo.findDraftRef(c.id))?.providerRef).toBe('c_first');
  });

  it('bindDraftRef 는 awaiting 이 아닌 행에는 걸리지 않는다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    // 이미 발송된 계약에 초안 핸들을 얹으면 발송된 계약을 초안처럼 다루게 된다.
    const c = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(c, []);

    const ok = await repo.bindDraftRef(c.id, {
      origin: 'template',
      providerRef: 'c_late',
      snowsignTemplateId: 'sst_1',
    });

    expect(ok).toBe(false);
    expect(await repo.findDraftRef(c.id)).toBeUndefined();
  });

  it('compose 초안에는 템플릿 판본이 저장되지 않는다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    await repo.bindDraftRef(c.id, { origin: 'compose', providerRef: 'c_compose' });

    // 판본이 실리면 템플릿 게이트가 compose 초안을 자기 것으로 오인할 수 있다.
    expect(await repo.findDraftRef(c.id)).toEqual({
      origin: 'compose',
      providerRef: 'c_compose',
    });
  });

  // 출처는 template 인데 판본이 없으면 **어느 판으로 만들었는지 알 수 없다** — 우리
  // 쓰기 경로로는 생길 수 없지만(union 이 둘을 묶는다) 손으로 쓴 행·미래의 다른
  // 라이터가 만들 수 있고, 그때 "template 이니 재사용" 으로 읽으면 옛 판이 나간다.
  it('findDraftRef 는 판본 없는 template 행과 미지 출처에 undefined 를 준다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    // RFP 당 활성 계약은 하나뿐이므로(signing_contracts_active_rfp_uniq) 한 행의
    // 출처만 바꿔 가며 두 모양을 본다.
    const c = makeContract(rfpId, buyer.id, {
      status: 'awaiting_pg_template',
      providerRef: 'c_half',
    });
    await repo.create(c, []);

    await db
      .update(signingContracts)
      .set({ providerDraftOrigin: 'template' }) // 판본은 비운 채
      .where(eq(signingContracts.id, c.id));
    expect(await repo.findDraftRef(c.id)).toBeUndefined();

    await db
      .update(signingContracts)
      .set({ providerDraftOrigin: 'embed' }) // 이 seam 이 모르는 값
      .where(eq(signingContracts.id, c.id));
    expect(await repo.findDraftRef(c.id)).toBeUndefined();
  });

  it('findDraftRef 는 ref 자체가 없으면 undefined 를 준다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    expect(await repo.findDraftRef(c.id)).toBeUndefined();
  });

  // 출처를 모르는 행(이 기능 이전)은 재사용 불가로 읽어야 한다 — 없는 값을 신뢰로
  // 읽는 것이 v0.4.50.0 fail-open 의 모양이었다.
  it('findDraftRef 는 출처가 없는 레거시 행에 undefined 를 준다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, {
      status: 'awaiting_pg_template',
      providerRef: 'c_legacy',
    });
    await repo.create(c, []);

    expect(await repo.findDraftRef(c.id)).toBeUndefined();
  });

  // ── clearDraftRefIf — bindDraftRef 의 역연산, 같은 CAS 규율 ─────────────────
  // 블라인드 clear(id 만 보는 UPDATE)는 그 사이 임베드 attach 가 바인딩한 **발송된**
  // 계약의 ref 를 지워 "sent + provider_ref NULL = 영구 조정불가" 행을 만든다.
  // 그래서 지우기도 기대 ref + awaiting 상태를 요구하고, 출처·판본을 같은 UPDATE 로
  // 함께 지운다(반쪽 clear 는 다음 초안을 오분류시킨다).

  it('clearDraftRefIf 는 기대 ref 가 일치하는 awaiting 행에서 ref·출처·판본을 한 UPDATE 로 지운다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.bindDraftRef(c.id, {
      origin: 'template',
      providerRef: 'c_first',
      snowsignTemplateId: 'sst_1',
    });

    const cleared = await repo.clearDraftRefIf(c.id, 'c_first');

    expect(cleared).toBe(true);
    // findDraftRef undefined 만으로는 반쪽 clear(ref 만 지움)를 못 가른다 — raw 로 셋 다 본다.
    const [row] = await db
      .select({
        providerRef: signingContracts.providerRef,
        origin: signingContracts.providerDraftOrigin,
        snowsignTemplateId: signingContracts.snowsignTemplateId,
      })
      .from(signingContracts)
      .where(eq(signingContracts.id, c.id));
    expect(row).toEqual({ providerRef: null, origin: null, snowsignTemplateId: null });
  });

  it('clearDraftRefIf 는 기대 ref 가 다르면 아무것도 지우지 않는다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.bindDraftRef(c.id, {
      origin: 'template',
      providerRef: 'c_first',
      snowsignTemplateId: 'sst_1',
    });

    // 낡은 스냅샷을 든 clear — 이기면 남(c_first)의 취소 핸들이 사라진다.
    const cleared = await repo.clearDraftRefIf(c.id, 'c_other');

    expect(cleared).toBe(false);
    expect(await repo.findDraftRef(c.id)).toEqual({
      origin: 'template',
      providerRef: 'c_first',
      snowsignTemplateId: 'sst_1',
    });
  });

  it('clearDraftRefIf 는 발송된(sent) 행은 ref 가 일치해도 지우지 않는다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.markSentIfAwaiting(c.id, { providerRef: 'ct_x', sentAt: new Date().toISOString() });

    const cleared = await repo.clearDraftRefIf(c.id, 'ct_x');

    expect(cleared).toBe(false);
    const after = (await repo.findById(c.id))!.contract;
    expect(after.status).toBe('sent');
    expect(after.providerRef).toBe('ct_x');
  });

  // 템플릿 발송은 리스를 잡고 SnowSign 왕복(최악 수십 초)을 도는데, 그 사이
  // forceClaimForSend 가 리스를 뺏을 수 있다 — 상태만 보는 CAS 는 그래도 커밋해
  // 계약이 두 건 살아난다. 리스 토큰까지 요구하는 CAS 로 뺏긴 발송이 지게 한다.
  it('markSentIfAwaiting with a lease token loses after forceClaimForSend displaces the holder', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const holder = await seedUser(db, { email: `h-${randomUUID().slice(0, 6)}@x.com` });
    const taker = await seedUser(db, { email: `t-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const now = new Date();
    await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id);
    const takerAt = new Date(now.getTime() + 1000);
    await repo.forceClaimForSend(c.id, takerAt, taker.id);

    // 옛 토큰(now)으로는 진다 — 상태는 그대로 awaiting 이어야 한다(뺏은 쪽이 이어간다).
    const stale = await repo.markSentIfAwaiting(
      c.id,
      { providerRef: 'ct_stale', sentAt: now.toISOString() },
      undefined,
      { claimedAt: now },
    );
    expect(stale).toBe(false);
    expect((await repo.findById(c.id))!.contract.status).toBe('awaiting_pg_template');

    // 현 소유 토큰으로는 이긴다.
    const fresh = await repo.markSentIfAwaiting(
      c.id,
      { providerRef: 'ct_fresh', sentAt: takerAt.toISOString() },
      undefined,
      { claimedAt: takerAt },
    );
    expect(fresh).toBe(true);
    expect((await repo.findById(c.id))!.contract.status).toBe('sent');
  });

  // 복구 스캔은 목록에서 받은 후보(최대 ~400건)마다 "이미 다른 행이 쥐었나"를 물었다.
  // 행마다 SELECT 를 때리면 12초 데드라인을 발송 리스를 쥔 채 태운다 — 한 번에 묻는다.
  it('findBoundProviderRefs returns only the refs that are already bound', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const bound = makeContract(rfpId, buyer.id, { status: 'sent', providerRef: 'ct_bound' });
    await repo.create(bound, []);

    const hit = await repo.findBoundProviderRefs(['ct_bound', 'ct_free', 'ct_other']);
    expect(hit).toEqual(new Set(['ct_bound']));
    // 빈 입력은 빈 집합. **주의**: 이 단언은 가드를 지키지 못한다 — drizzle 이
    // inArray(col, []) 를 거짓 술어로 컴파일해 PGlite 는 가드를 지워도 0행을 준다.
    // 가드의 근거는 드라이버 편차(postgres-js)이고, 그건 여기서 관측되지 않는다.
    expect(await repo.findBoundProviderRefs([])).toEqual(new Set());
  });

  // ── 강제 이어받기 ────────────────────────────────────────────────────────
  //
  // 동료가 임베드를 열어둔 채 자리를 비우면 하트비트가 리스를 무한 연장해 영영
  // 풀리지 않는다. 강제 취득은 **경합**을 무시하되 **상태**는 존중한다.

  it('forceClaimForSend takes a live lease and reports who was displaced', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId, pgWs } = await setup();
    const holder = await seedUser(db, { email: `a-${randomUUID().slice(0, 6)}@x.com` });
    const taker = await seedUser(db, { email: `b-${randomUUID().slice(0, 6)}@x.com` });
    void pgWs;
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const now = new Date();
    expect(await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id)).toBe(true);

    const r = await repo.forceClaimForSend(c.id, new Date(now.getTime() + 1000), taker.id);
    expect(r).toEqual({ taken: true, displacedUserId: holder.id });
    expect((await repo.findSendLease(c.id))?.holderUserId).toBe(taker.id);
  });

  // 강제는 경합에 대한 것이지 상태에 대한 게 아니다 — 이미 발송된 계약은 못 뺏는다.
  it('forceClaimForSend still refuses a contract that left awaiting', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const holder = await seedUser(db, { email: `a-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const now = new Date();
    await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id);
    await repo.markSentIfAwaiting(c.id, { providerRef: 'ct_x', sentAt: now.toISOString() });

    expect(await repo.forceClaimForSend(c.id, new Date(), holder.id)).toEqual({ taken: false });
  });

  it('forceClaimForSend on a free lease reports nobody displaced', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const taker = await seedUser(db, { email: `b-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    expect(await repo.forceClaimForSend(c.id, new Date(), taker.id)).toEqual({
      taken: true,
      displacedUserId: null,
    });
  });

  // 둘이 동시에 뺏으면 하나만 이겨야 한다 — 진 쪽이 승자를 다시 밀어내면
  // 계약이 두 건 살아나는 걸 막는 장치가 통째로 무의미해진다.
  it('two force-claims: exactly one wins and the loser does not displace the winner', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const holder = await seedUser(db, { email: `a-${randomUUID().slice(0, 6)}@x.com` });
    const t1 = await seedUser(db, { email: `b-${randomUUID().slice(0, 6)}@x.com` });
    const t2 = await seedUser(db, { email: `c-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const now = new Date();
    await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id);

    const [a, b] = await Promise.all([
      repo.forceClaimForSend(c.id, new Date(now.getTime() + 1000), t1.id),
      repo.forceClaimForSend(c.id, new Date(now.getTime() + 2000), t2.id),
    ]);
    const wins = [a, b].filter((r) => r.taken);
    expect(wins).toHaveLength(1);
    const winner = a.taken ? t1.id : t2.id;
    expect((await repo.findSendLease(c.id))?.holderUserId).toBe(winner);
  });

  // 반납이 소유자를 안 지우면, 그 다음 강제 취득이 **이미 놓고 나간 사람**을 밀려난
  // 사람으로 보고해 엉뚱한 알림이 간다. `findSendLease` 로는 이걸 못 잡는다 —
  // 타임스탬프가 비면 소유자와 무관하게 undefined 라서(그렇게 썼다가 가짜였다).
  it('releaseSendClaim clears the holder so a later force-claim displaces nobody', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const holder = await seedUser(db, { email: `a-${randomUUID().slice(0, 6)}@x.com` });
    const taker = await seedUser(db, { email: `b-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const now = new Date();
    await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id);

    await repo.releaseSendClaim(c.id, now);
    expect(await repo.findSendLease(c.id)).toBeUndefined();
    expect(await repo.forceClaimForSend(c.id, new Date(), taker.id)).toEqual({
      taken: true,
      displacedUserId: null,
    });
  });

  // 하트비트는 소유자를 바꾸지 않는다 — 60초마다 정보 없는 쓰기를 늘릴 이유가 없다.
  it('renewSendClaim keeps the holder unchanged', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const holder = await seedUser(db, { email: `a-${randomUUID().slice(0, 6)}@x.com` });
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    const now = new Date();
    await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), holder.id);

    const next = new Date(now.getTime() + 60_000);
    expect(await repo.renewSendClaim(c.id, now, next)).toBe(true);
    const lease = await repo.findSendLease(c.id);
    expect(lease?.holderUserId).toBe(holder.id);
    expect(lease?.claimedAt.toISOString()).toBe(next.toISOString());
  });

  it('claimForSend refuses a contract that already left awaiting', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(c, []);

    const now = new Date();
    expect(await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), buyer.id)).toBe(false);
  });

  it('claimForSend succeeds again once the lease expires (crashed send is recoverable)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const claimedAt = new Date(Date.now() - 10 * 60_000); // 10분 전에 잡고 죽음
    expect(await repo.claimForSend(c.id, claimedAt, new Date(Date.now() - 120_000), buyer.id)).toBe(true);

    const now = new Date();
    expect(await repo.claimForSend(c.id, now, new Date(now.getTime() - 120_000), buyer.id)).toBe(true);
  });

  it('releaseSendClaim frees the row so a retry can claim immediately', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const now = new Date();
    const leaseBefore = new Date(now.getTime() - 120_000);
    expect(await repo.claimForSend(c.id, now, leaseBefore, buyer.id)).toBe(true);
    expect(await repo.claimForSend(c.id, now, leaseBefore, buyer.id)).toBe(false);

    await repo.releaseSendClaim(c.id, now);
    expect(await repo.claimForSend(c.id, now, leaseBefore, buyer.id)).toBe(true);
  });

  // 리스가 만료돼 B 가 정당히 재취득한 뒤, 뒤늦게 실패한 A 의 해제가 B 의 살아있는
  // 클레임을 풀어버리면 이중 발송이 열린다.
  it('releaseSendClaim does not free a lease that someone else re-claimed', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);

    const aClaimedAt = new Date(Date.now() - 10 * 60_000); // A 가 잡고 멈춤
    expect(await repo.claimForSend(c.id, aClaimedAt, new Date(0), buyer.id)).toBe(true);

    const now = new Date();
    const leaseBefore = new Date(now.getTime() - 120_000);
    expect(await repo.claimForSend(c.id, now, leaseBefore, buyer.id)).toBe(true); // B 가 재취득

    await repo.releaseSendClaim(c.id, aClaimedAt); // A 가 뒤늦게 해제 시도
    // B 의 클레임은 살아 있어야 한다 — 제3의 클릭이 들어와도 못 잡는다.
    expect(await repo.claimForSend(c.id, now, leaseBefore, buyer.id)).toBe(false);
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
    expect(await repo.claimForSend(c.id, t0, new Date(t0.getTime() - 300_000), buyer.id)).toBe(true);

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
    await repo.claimForSend(c.id, theirs, new Date(theirs.getTime() - 300_000), buyer.id);

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
    await repo.claimForSend(c.id, t0, new Date(t0.getTime() - 300_000), buyer.id);
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

  // 제약은 **부분** 유니크여야 한다. 다만 행 두 개를 넣어 보는 것으로는 증명되지
  // 않는다 — Postgres 는 평범한 UNIQUE 에서도 NULL 을 서로 다르게 보므로 부분 절을
  // 지워도 통과한다(그렇게 썼다가 변이 검증에서 가짜로 드러났다). 인덱스 정의를
  // 직접 본다.
  it('scopes the provider_ref unique index to non-null rows', async () => {
    // 드라이버마다 반환 형태가 다르다(PGlite 는 { rows }, postgres-js 는 배열).
    const raw = (await db.execute(
      sql`select indexdef from pg_indexes where indexname = 'signing_contracts_provider_ref_uniq'`,
    )) as unknown as { rows?: Array<{ indexdef: string }> } | Array<{ indexdef: string }>;
    const rows = Array.isArray(raw) ? raw : (raw.rows ?? []);
    const def = rows[0]?.indexdef ?? '';
    expect(def).toMatch(/UNIQUE/i);
    expect(def.replace(/\s+/g, ' ')).toMatch(/WHERE \(provider_ref IS NOT NULL\)/i);
  });

  // 그리고 실제로 대기 행이 여럿 공존할 수 있어야 한다(위 정의의 결과).
  it('allows many contracts with a null provider_ref', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const one = await setup();
    const two = await setup();
    await repo.create(makeContract(one.rfpId, one.buyer.id, { status: 'awaiting_pg_template' }), []);
    await repo.create(makeContract(two.rfpId, two.buyer.id, { status: 'awaiting_pg_template' }), []);
    expect(await repo.findActiveByRfp(two.rfpId)).toBeTruthy();
  });

  // 스캔이 노출한 계약 id 는 그 뒤로 상관키를 요구받는다. 그 판정의 근거가 이 대장이다.
  it('recordRecoveryDisclosure 는 노출한 id 를 남기고, 다시 스캔하면 합집합이 된다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.recordRecoveryDisclosure(c.id, ['ct_a', 'ct_b']);
    expect(await repo.isRefDisclosed('ct_a')).toBe(true);
    expect(await repo.isRefDisclosed('ct_b')).toBe(true);

    // 다음 스캔 결과는 이전 것에 **더해진다** — 노출은 비가역이라 되돌릴 수 없다.
    await repo.recordRecoveryDisclosure(c.id, ['ct_c']);
    expect(await repo.isRefDisclosed('ct_c')).toBe(true);
    expect(await repo.isRefDisclosed('ct_a')).toBe(true);
    expect(await repo.isRefDisclosed('ct_b')).toBe(true);
  });

  // 누적이라 상한이 필요하다. 넘치면 **가장 오래된** 노출부터 밀린다 — 새로 노출된
  // id 가 게이트를 못 받는 것이 더 위험하기 때문.
  it('recordRecoveryDisclosure 는 상한을 넘으면 오래된 노출부터 밀어낸다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.recordRecoveryDisclosure(c.id, ['ct_oldest']);
    // 상한(200)을 확실히 넘긴다.
    for (let i = 0; i < 21; i += 1) {
      await repo.recordRecoveryDisclosure(
        c.id,
        Array.from({ length: 10 }, (_, j) => `ct_fill_${i}_${j}`),
      );
    }
    expect(await repo.isRefDisclosed('ct_fill_20_9')).toBe(true);
    expect(await repo.isRefDisclosed('ct_oldest')).toBe(false);
  });

  // 축소된 재스캔이 게이트를 지워선 안 된다. 한 번 브라우저로 나간 id 는 영영 나간
  // 것이라, 다음 스캔이 그 id 를 못 담았다고 해서 "노출된 적 없음"으로 되돌아가면
  // 상관키 검사가 통째로 꺼진다 — 데드라인 중단·상세 조회 실패·타 딜 바인딩 셋 다
  // 후보를 줄이므로 평범하게 재현된다.
  it('recordRecoveryDisclosure 는 축소된 재스캔에도 이전 노출을 지우지 않는다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(c, []);
    await repo.recordRecoveryDisclosure(c.id, ['ct_a', 'ct_b']);

    // 2회차 스캔이 ct_a 를 못 담았다(중단됐거나 상세 조회가 실패했다).
    await repo.recordRecoveryDisclosure(c.id, ['ct_b']);

    expect(await repo.isRefDisclosed('ct_a')).toBe(true);
    expect(await repo.isRefDisclosed('ct_b')).toBe(true);
  });

  // 핵심: 노출 여부는 **딜을 가리지 않고** 전역으로 물어야 한다. 공격이 성립하는 건
  // 딜 A 에서 배운 id 를 딜 B 에 붙일 때이므로, 딜 B 에서 물어도 참이어야 한다.
  it('isRefDisclosed 는 다른 딜에서 노출된 id 도 참으로 답한다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const one = await setup();
    const two = await setup();
    const a = makeContract(one.rfpId, one.buyer.id, { status: 'awaiting_pg_template' });
    const b = makeContract(two.rfpId, two.buyer.id, { status: 'awaiting_pg_template' });
    await repo.create(a, []);
    await repo.create(b, []);
    await repo.recordRecoveryDisclosure(a.id, ['ct_from_a']);
    expect(b.id).not.toBe(a.id);
    expect(await repo.isRefDisclosed('ct_from_a')).toBe(true);
  });

  it('노출된 적 없는 id 는 거짓 — 임베드에서 갓 만든 계약이 여기 걸리면 안 된다', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    await repo.create(makeContract(rfpId, buyer.id, { status: 'awaiting_pg_template' }), []);
    expect(await repo.isRefDisclosed('ct_never_scanned')).toBe(false);
  });
});
