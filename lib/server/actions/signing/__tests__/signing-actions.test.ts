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
import { linkSigningTemplateAction } from '../linkSigningTemplateAction';
import { getSigningTemplateDetailAction } from '../getSigningTemplateDetailAction';
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
  it('linkSigningTemplateAction requires a PG session and delegates to linkTemplate', async () => {
    const linkTemplate = vi.fn(async () => ({ ok: true as const, templateId: 't1' }));
    __setContractSigningServiceForTest({ linkTemplate } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await linkSigningTemplateAction({
      snowsignTemplateId: 'tmpl',
      name: 'n',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
    });
    expect(r.ok).toBe(true);
    expect(linkTemplate).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'pgws' },
      expect.objectContaining({ snowsignTemplateId: 'tmpl' }),
    );
  });

  it('linkSigningTemplateAction rejects a buyer session', async () => {
    __setContractSigningServiceForTest({ linkTemplate: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await linkSigningTemplateAction({
      snowsignTemplateId: 'tmpl',
      name: 'n',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
  });

  it('getSigningTemplateDetailAction requires a PG session and delegates to getTemplateDetail', async () => {
    const getTemplateDetail = vi.fn(async () => ({
      ok: true as const,
      name: '표준 가맹계약서',
      roleNames: ['구매사', 'PG'],
      variables: [],
    }));
    __setContractSigningServiceForTest({ getTemplateDetail } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await getSigningTemplateDetailAction({ snowsignTemplateId: 'tmpl_1' });
    expect(r.ok).toBe(true);
    expect(getTemplateDetail).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'pgws' }, 'tmpl_1');
  });

  it('getSigningTemplateDetailAction rejects a buyer session', async () => {
    __setContractSigningServiceForTest({
      getTemplateDetail: vi.fn(),
    } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await getSigningTemplateDetailAction({ snowsignTemplateId: 'tmpl_1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
  });

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
});
