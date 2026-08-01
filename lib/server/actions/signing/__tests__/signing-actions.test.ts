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
    expect(attachProviderContract).toHaveBeenCalledWith(rfp.id, 'ct_abc12345', {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
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

  // 임베드를 닫으면 리스를 반납한다 — 안 그러면 닫은 본인이 30분 잠긴다.
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
});
