import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

type Session = {
  user: {
    id: string;
    email: string;
    workspaceId: string;
    workspaceType: 'buyer' | 'pg';
    role: 'admin' | 'member';
  };
};
const sessionRef: { value: Session | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('UNAUTH')),
  requirePgSession: () =>
    sessionRef.value && sessionRef.value.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
  requireBuyerSession: () =>
    sessionRef.value && sessionRef.value.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
}));

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';
import { issueSigningSendEmbedSessionAction } from '../issueSigningSendEmbedSessionAction';
import { attachSigningContractAction } from '../attachSigningContractAction';
import { listSigningRecoveryCandidatesAction } from '../listSigningRecoveryCandidatesAction';
import { getSigningSendHolderAction } from '../getSigningSendHolderAction';
import { takeoverSigningSendEmbedAction } from '../takeoverSigningSendEmbedAction';
import { releaseSigningSendEmbedAction } from '../releaseSigningSendEmbedAction';
import { renewSigningSendEmbedAction } from '../renewSigningSendEmbedAction';
import { cancelSigningAction } from '../cancelSigningAction';
import { getSigningStatusAction } from '../getSigningStatusAction';

let db: PgliteDB;
const pgSession = (id = 'u1', ws = 'pgws'): Session => ({
  user: { id, email: 'p@x.com', workspaceId: ws, workspaceType: 'pg', role: 'admin' },
});
const buyerSession = (id = 'u2', ws = 'bws'): Session => ({
  user: { id, email: 'b@x.com', workspaceId: ws, workspaceType: 'buyer', role: 'admin' },
});

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
  __resetContractSigningServiceForTest();
  sessionRef.value = null;
});

describe('signing actions wiring', () => {
  it('cancelSigningAction delegates to cancel with contractId + reason', async () => {
    const cancel = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ cancel } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const contractId = randomUUID();
    const r = await cancelSigningAction({ contractId, reason: '재작성' });
    expect(r.ok).toBe(true);
    expect(cancel).toHaveBeenCalledWith(contractId, { userId: 'u2', workspaceId: 'bws' }, '재작성');
  });

  it('getSigningStatusAction resolves rfpCode → id and delegates to getForActor', async () => {
    const buyer = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: buyer.id, code: 'P-2608-0001' });
    const getForActor = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ getForActor } as unknown as ContractSigningService);
    sessionRef.value = buyerSession(buyer.id, bws.id);
    const r = await getSigningStatusAction({ rfpCode: 'P-2608-0001' });
    expect(r.ok).toBe(true);
    expect(getForActor).toHaveBeenCalledWith(rfp.id, { userId: buyer.id, workspaceId: bws.id });
  });

  it('getSigningStatusAction returns RFP_NOT_FOUND for an unknown code', async () => {
    __setContractSigningServiceForTest({ getForActor: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await getSigningStatusAction({ rfpCode: 'P-9999-9999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_FOUND');
  });

  it('issueSigningSendEmbedSessionAction resolves rfpCode → id and delegates', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0100' });
    const createSendEmbedSession = vi.fn(async () => ({
      ok: true as const,
      iframeUrl: 'https://app.snowsign.example/e',
      sessionId: 's1',
    }));
    __setContractSigningServiceForTest({
      createSendEmbedSession,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await issueSigningSendEmbedSessionAction({ rfpCode: 'P-2608-0100' });
    expect(r.ok).toBe(true);
    expect(createSendEmbedSession).toHaveBeenCalledWith(rfp.id, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  // 구매사는 계약서를 올릴 수 없다 — 액션 게이트가 서비스 ACL 앞에 한 겹 더 선다.
  it('issueSigningSendEmbedSessionAction rejects a buyer session', async () => {
    const createSendEmbedSession = vi.fn();
    __setContractSigningServiceForTest({
      createSendEmbedSession,
    } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await issueSigningSendEmbedSessionAction({ rfpCode: 'P-2608-0100' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
    expect(createSendEmbedSession).not.toHaveBeenCalled();
  });

  it('attachSigningContractAction delegates the provider contract id', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0100' });
    const attachProviderContract = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({
      attachProviderContract,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await attachSigningContractAction({
      rfpCode: 'P-2608-0100',
      providerContractId: 'ct_abc12345',
    });
    expect(r.ok).toBe(true);
    expect(attachProviderContract).toHaveBeenCalledWith(
      rfp.id,
      'ct_abc12345',
      { userId: pgUser.id, workspaceId: 'pgws' },
      { expectedContractId: undefined },
    );
  });

  // 복구 다이얼로그는 사용자가 보던 계약 행을 함께 넘긴다(출처는 서버가 도출).
  it('attachSigningContractAction forwards expectedContractId', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0111' });
    const attachProviderContract = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({
      attachProviderContract,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');
    const expected = randomUUID();

    const r = await attachSigningContractAction({
      rfpCode: 'P-2608-0111',
      providerContractId: 'ct_abc12345',
      expectedContractId: expected,
    });
    expect(r.ok).toBe(true);
    expect(attachProviderContract).toHaveBeenCalledWith(
      rfp.id,
      'ct_abc12345',
      { userId: pgUser.id, workspaceId: 'pgws' },
      { expectedContractId: expected },
    );
  });

  it('attachSigningContractAction rejects a non-uuid expectedContractId', async () => {
    const attachProviderContract = vi.fn();
    __setContractSigningServiceForTest({
      attachProviderContract,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await attachSigningContractAction({
      rfpCode: 'P-2608-0100',
      providerContractId: 'ct_abc12345',
      expectedContractId: 'nope',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(attachProviderContract).not.toHaveBeenCalled();
  });

  // ── 고아 복구 후보 조회 ────────────────────────────────────────────────
  it('listSigningRecoveryCandidatesAction resolves rfpCode and delegates', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0120' });
    const listRecoveryCandidates = vi.fn(async () => ({
      ok: true as const,
      candidates: [],
      truncated: false,
    }));
    __setContractSigningServiceForTest({
      listRecoveryCandidates,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await listSigningRecoveryCandidatesAction({ rfpCode: 'P-2608-0120' });
    expect(r.ok).toBe(true);
    expect(listRecoveryCandidates).toHaveBeenCalledWith(rfp.id, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  it('listSigningRecoveryCandidatesAction rejects a buyer session', async () => {
    const listRecoveryCandidates = vi.fn();
    __setContractSigningServiceForTest({
      listRecoveryCandidates,
    } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await listSigningRecoveryCandidatesAction({ rfpCode: 'P-2608-0120' });
    expect(r.ok).toBe(false);
    expect(listRecoveryCandidates).not.toHaveBeenCalled();
  });

  it('listSigningRecoveryCandidatesAction returns RFP_NOT_FOUND for an unknown code', async () => {
    const listRecoveryCandidates = vi.fn();
    __setContractSigningServiceForTest({
      listRecoveryCandidates,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await listSigningRecoveryCandidatesAction({ rfpCode: 'P-9999-9999' });
    expect(r).toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
    expect(listRecoveryCandidates).not.toHaveBeenCalled();
  });

  it('attachSigningContractAction rejects a buyer session', async () => {
    const attachProviderContract = vi.fn();
    __setContractSigningServiceForTest({
      attachProviderContract,
    } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await attachSigningContractAction({
      rfpCode: 'P-2608-0100',
      providerContractId: 'ct_abc12345',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
    expect(attachProviderContract).not.toHaveBeenCalled();
  });

  // providerContractId 는 브라우저 postMessage 에서 온다 — 서버 경로 세그먼트로
  // 들어가므로 화이트리스트 밖 문자열은 서비스에 닿기 전에 막힌다.
  it.each(['../../v1/templates', 'short', 'has space', ''])(
    'attachSigningContractAction rejects a malformed provider id (%s)',
    async (bad) => {
      const attachProviderContract = vi.fn();
      __setContractSigningServiceForTest({
        attachProviderContract,
      } as unknown as ContractSigningService);
      sessionRef.value = pgSession();
      const r = await attachSigningContractAction({
        rfpCode: 'P-2608-0100',
        providerContractId: bad,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
      expect(attachProviderContract).not.toHaveBeenCalled();
    },
  );

  it('attachSigningContractAction returns RFP_NOT_FOUND for an unknown code', async () => {
    __setContractSigningServiceForTest({
      attachProviderContract: vi.fn(),
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await attachSigningContractAction({
      rfpCode: 'P-9999-9999',
      providerContractId: 'ct_abc12345',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_FOUND');
  });

  // 임베드를 닫으면 리스를 반납한다 — 안 그러면 닫은 본인이 리스 만료까지 잠긴다.
  it('releaseSigningSendEmbedAction resolves rfpCode → id and delegates', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0100' });
    const releaseSendEmbedClaim = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({
      releaseSendEmbedClaim,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const at = new Date().toISOString();
    const r = await releaseSigningSendEmbedAction({ rfpCode: 'P-2608-0100', claimedAt: at });
    expect(r.ok).toBe(true);
    expect(releaseSendEmbedClaim).toHaveBeenCalledWith(rfp.id, at, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  it('releaseSigningSendEmbedAction rejects a buyer session', async () => {
    const releaseSendEmbedClaim = vi.fn();
    __setContractSigningServiceForTest({
      releaseSendEmbedClaim,
    } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await releaseSigningSendEmbedAction({
      rfpCode: 'P-2608-0100',
      claimedAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
    expect(releaseSendEmbedClaim).not.toHaveBeenCalled();
  });

  it('releaseSigningSendEmbedAction rejects a non-datetime claimedAt', async () => {
    const releaseSendEmbedClaim = vi.fn();
    __setContractSigningServiceForTest({
      releaseSendEmbedClaim,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await releaseSigningSendEmbedAction({ rfpCode: 'P-2608-0100', claimedAt: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    expect(releaseSendEmbedClaim).not.toHaveBeenCalled();
  });

  // release 와 같은 가드가 하트비트에도 걸려 있어야 한다 — 여기가 느슨해지면
  // 임의 문자열이 CAS 비교로 그대로 흘러간다.
  it('renewSigningSendEmbedAction rejects a non-datetime claimedAt', async () => {
    const renewSendEmbedClaim = vi.fn();
    __setContractSigningServiceForTest({
      renewSendEmbedClaim,
    } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await renewSigningSendEmbedAction({ rfpCode: 'P-2608-0100', claimedAt: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
    expect(renewSendEmbedClaim).not.toHaveBeenCalled();
  });

  it('renewSigningSendEmbedAction delegates and passes the new token back', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0100' });
    const renewSendEmbedClaim = vi.fn(async () => ({ ok: true as const, claimedAt: 'NEW' }));
    __setContractSigningServiceForTest({ renewSendEmbedClaim } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const at = new Date().toISOString();
    const r = await renewSigningSendEmbedAction({ rfpCode: 'P-2608-0100', claimedAt: at });
    expect(r).toEqual({ ok: true, claimedAt: 'NEW' });
    expect(renewSendEmbedClaim).toHaveBeenCalledWith(rfp.id, at, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  it('renewSigningSendEmbedAction rejects a buyer session', async () => {
    const renewSendEmbedClaim = vi.fn();
    __setContractSigningServiceForTest({ renewSendEmbedClaim } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await renewSigningSendEmbedAction({
      rfpCode: 'P-2608-0100',
      claimedAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
    expect(renewSendEmbedClaim).not.toHaveBeenCalled();
  });

  // 강제 이어받기는 **별도 액션**이다. 기본 액션이 옵션 하나로 뺏을 수 있게 되면
  // 어느 호출부가 그 옵션을 켜는지 추적해야 하고, 실수로 켜진 기본값이 조용히
  // 동료를 밀어낸다. 여기서 그 분리를 못박는다.
  it('issueSigningSendEmbedSessionAction 은 어떤 입력으로도 이어받지 않는다', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0140' });
    const createSendEmbedSession = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ createSendEmbedSession } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    // 1) 몰래 얹은 키는 strict() 가 통째로 거절한다 — 서비스까지 가지도 않는다.
    const smuggled = await issueSigningSendEmbedSessionAction({
      rfpCode: 'P-2608-0140',
      takeOver: true,
    } as unknown as { rfpCode: string });
    expect(smuggled).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(createSendEmbedSession).not.toHaveBeenCalled();

    // 2) 정상 입력에서도 옵션 인자 자체를 넘기지 않는다(기본 경로에 뺏기가 없다).
    await issueSigningSendEmbedSessionAction({ rfpCode: 'P-2608-0140' });
    expect(createSendEmbedSession.mock.calls[0]).toHaveLength(2);
  });

  it('takeoverSigningSendEmbedAction 은 takeOver 를 켜서 위임한다', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0141' });
    const createSendEmbedSession = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ createSendEmbedSession } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await takeoverSigningSendEmbedAction({ rfpCode: 'P-2608-0141' });
    expect(r.ok).toBe(true);
    expect(createSendEmbedSession).toHaveBeenCalledWith(
      rfp.id,
      { userId: pgUser.id, workspaceId: 'pgws' },
      { takeOver: true },
    );
  });

  it('takeoverSigningSendEmbedAction 은 구매사 세션을 거절한다', async () => {
    const createSendEmbedSession = vi.fn();
    __setContractSigningServiceForTest({ createSendEmbedSession } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await takeoverSigningSendEmbedAction({ rfpCode: 'P-2608-0141' });
    expect(r.ok).toBe(false);
    expect(createSendEmbedSession).not.toHaveBeenCalled();
  });

  it('listSigningRecoveryCandidatesAction 은 rfpCode 를 풀어 위임한다', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0142' });
    const listRecoveryCandidates = vi.fn(async () => ({
      ok: true as const,
      candidates: [],
      truncated: false,
    }));
    __setContractSigningServiceForTest({ listRecoveryCandidates } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    await listSigningRecoveryCandidatesAction({ rfpCode: 'P-2608-0142' });
    expect(listRecoveryCandidates).toHaveBeenLastCalledWith(rfp.id, expect.any(Object));
  });

  // 이 액션에는 뺏기 인자가 **없다.** 스캔은 읽기인데 강제 취득은 동료의 임베드를
  // 닫고 작성물을 없앤다 — 목록만 보려던 클릭이 남의 작업을 죽이면 안 되므로,
  // 파괴적 조작의 진입점은 임베드('계약서 올리기') 하나로 모았다. 인자가 되살아나면
  // 그 결정이 조용히 뒤집히므로 스키마가 거부하는 것을 못박는다.
  it('listSigningRecoveryCandidatesAction 은 뺏기 인자를 받지 않는다', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0242' });
    const listRecoveryCandidates = vi.fn(async () => ({
      ok: true as const,
      candidates: [],
      truncated: false,
    }));
    __setContractSigningServiceForTest({ listRecoveryCandidates } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await listSigningRecoveryCandidatesAction({
      rfpCode: 'P-2608-0242',
      takeOver: true,
    } as unknown as { rfpCode: string });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(listRecoveryCandidates).not.toHaveBeenCalled();
  });

  it('getSigningSendHolderAction 은 rfpCode 를 풀어 위임한다', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0143' });
    const getSendLeaseHolder = vi.fn(async () => ({ ok: true as const, holder: null }));
    __setContractSigningServiceForTest({ getSendLeaseHolder } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const r = await getSigningSendHolderAction({ rfpCode: 'P-2608-0143' });
    expect(r.ok).toBe(true);
    expect(getSendLeaseHolder).toHaveBeenCalledWith(rfp.id, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  it('getSigningSendHolderAction 은 구매사 세션을 거절한다 — 누가 작성 중인지 알 이유가 없다', async () => {
    const getSendLeaseHolder = vi.fn();
    __setContractSigningServiceForTest({ getSendLeaseHolder } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await getSigningSendHolderAction({ rfpCode: 'P-2608-0143' });
    expect(r.ok).toBe(false);
    expect(getSendLeaseHolder).not.toHaveBeenCalled();
  });
});
