// reassignContractSignerAction — buyer admin 이 미서명 구매사측 서명자를 재지정.
// requireBuyerActor 게이트 + zod 파싱 후 meta 캡처해 ContractService.reassignBuyerSigner 위임.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const headersImpl = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: (...a: unknown[]) => headersImpl(...a) }));

type SessionUser = { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
}));

import {
  ContractService,
  __resetContractServiceForTest,
  __setContractServiceForTest,
} from '@/lib/server/services/contract';
import { reassignContractSignerAction } from '../reassignContractSignerAction';

const DOC_ID = randomUUID();
const NEW_SIGNER_ID = randomUUID();

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { reassignBuyerSigner: fn });
  __setContractServiceForTest(fake);
  return fake;
}

beforeEach(() => {
  headersImpl.mockReset();
  headersImpl.mockResolvedValue({
    get: (name: string) =>
      ({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest-agent' })[name.toLowerCase()] ?? null,
  });
  sessionRef.value = { user: { id: 'u1', email: 'x@x.com', workspaceId: 'ws1', workspaceType: 'buyer' } };
});

afterEach(() => {
  __resetContractServiceForTest();
  sessionRef.value = null;
  vi.clearAllMocks();
});

describe('reassignContractSignerAction', () => {
  it('rejects a PG session → FORBIDDEN_BUYER', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'p@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await reassignContractSignerAction({ docId: DOC_ID, newUserId: NEW_SIGNER_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_BUYER' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid newUserId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await reassignContractSignerAction({ docId: DOC_ID, newUserId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates docId + newUserId + actor + meta to ContractService.reassignBuyerSigner', async () => {
    sessionRef.value = { user: { id: 'buyer-1', email: 'x@x.com', workspaceId: 'buyer-ws-1', workspaceType: 'buyer' } };
    const spy = vi.fn(async () => ({ ok: true as const }));
    mockService(spy);

    const res = await reassignContractSignerAction({ docId: DOC_ID, newUserId: NEW_SIGNER_ID });

    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(
      DOC_ID,
      NEW_SIGNER_ID,
      { userId: 'buyer-1', workspaceId: 'buyer-ws-1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('passes through a service error unchanged (e.g. SIGNER_ALREADY_SIGNED)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'SIGNER_ALREADY_SIGNED' }));
    mockService(spy);
    const r = await reassignContractSignerAction({ docId: DOC_ID, newUserId: NEW_SIGNER_ID });
    expect(r).toEqual({ ok: false, error: 'SIGNER_ALREADY_SIGNED' });
  });
});
