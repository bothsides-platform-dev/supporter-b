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
import { sendSigningContractAction } from '../sendSigningContractAction';
import { renameSigningTemplateAction } from '../renameSigningTemplateAction';
import { deleteSigningTemplateAction } from '../deleteSigningTemplateAction';
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

  it('sendSigningContractAction resolves rfpCode → id and delegates to sendContract', async () => {
    const pgUser = await seedUser(db);
    const bws = await seedBuyerWorkspace(db);
    const rfp = await seedRfp(db, { buyerWsId: bws.id, createdBy: pgUser.id, code: 'P-2608-0100' });
    const sendContract = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ sendContract } as unknown as ContractSigningService);
    sessionRef.value = pgSession(pgUser.id, 'pgws');

    const templateId = randomUUID();
    const r = await sendSigningContractAction({ rfpCode: 'P-2608-0100', templateId });
    expect(r.ok).toBe(true);
    expect(sendContract).toHaveBeenCalledWith(rfp.id, templateId, {
      userId: pgUser.id,
      workspaceId: 'pgws',
    });
  });

  // 구매사는 PG 계약서를 고를 수 없다 — 액션 게이트가 서비스 ACL 앞에 한 겹 더 선다.
  it('sendSigningContractAction rejects a buyer session', async () => {
    __setContractSigningServiceForTest({ sendContract: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await sendSigningContractAction({ rfpCode: 'P-2608-0100', templateId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
  });

  it('sendSigningContractAction rejects a non-uuid templateId', async () => {
    __setContractSigningServiceForTest({ sendContract: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await sendSigningContractAction({ rfpCode: 'P-2608-0100', templateId: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('sendSigningContractAction returns RFP_NOT_FOUND for an unknown code', async () => {
    __setContractSigningServiceForTest({ sendContract: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await sendSigningContractAction({ rfpCode: 'P-9999-9999', templateId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_FOUND');
  });

  it('renameSigningTemplateAction requires a PG session and delegates to renameTemplate', async () => {
    const renameTemplate = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ renameTemplate } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const templateId = randomUUID();
    const r = await renameSigningTemplateAction({ templateId, name: '가맹계약서 v3' });
    expect(r.ok).toBe(true);
    expect(renameTemplate).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'pgws' },
      templateId,
      '가맹계약서 v3',
    );
  });

  it('renameSigningTemplateAction rejects a blank name and a buyer session', async () => {
    __setContractSigningServiceForTest({ renameTemplate: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const blank = await renameSigningTemplateAction({ templateId: randomUUID(), name: '   ' });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error).toBe('INVALID_INPUT');

    sessionRef.value = buyerSession();
    const asBuyer = await renameSigningTemplateAction({ templateId: randomUUID(), name: 'x' });
    expect(asBuyer.ok).toBe(false);
    if (!asBuyer.ok) expect(asBuyer.error).toBe('FORBIDDEN_PG');
  });

  it('deleteSigningTemplateAction requires a PG session and delegates to deleteTemplate', async () => {
    const deleteTemplate = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ deleteTemplate } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const templateId = randomUUID();
    const r = await deleteSigningTemplateAction({ templateId });
    expect(r.ok).toBe(true);
    expect(deleteTemplate).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'pgws' }, templateId);
  });

  it('deleteSigningTemplateAction rejects a buyer session', async () => {
    __setContractSigningServiceForTest({ deleteTemplate: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = buyerSession();
    const r = await deleteSigningTemplateAction({ templateId: randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_PG');
  });

  // isDefault 는 사라진 개념 — strict 스키마가 잔존 클라이언트의 전송을 거부해야 한다.
  it('linkSigningTemplateAction rejects a stale isDefault field (strict)', async () => {
    __setContractSigningServiceForTest({ linkTemplate: vi.fn() } as unknown as ContractSigningService);
    sessionRef.value = pgSession();
    const r = await linkSigningTemplateAction({
      snowsignTemplateId: 'tmpl',
      name: 'n',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      isDefault: true,
    } as unknown as Parameters<typeof linkSigningTemplateAction>[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});
