import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';
import { getSigningStatusAction } from '../getSigningStatusAction';

let db: PgliteDB;
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
  sessionRef.value = null;
});

describe('signing actions wiring', () => {

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
});
