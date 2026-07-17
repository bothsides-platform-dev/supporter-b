// declineContractAction — buyer 가 발송된 계약서를 반려. requireBuyerActor 게이트 +
// zod 파싱 후 meta 캡처해 ContractService.decline 위임.
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
import { declineContractAction } from '../declineContractAction';

const DOC_ID = randomUUID();

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { decline: fn });
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

describe('declineContractAction', () => {
  it('rejects a PG session → FORBIDDEN_BUYER', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'p@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await declineContractAction({ docId: DOC_ID, reason: '조건 재검토 필요' });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_BUYER' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an empty reason → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await declineContractAction({ docId: DOC_ID, reason: '' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a reason over 500 chars → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await declineContractAction({ docId: DOC_ID, reason: 'x'.repeat(501) });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates docId + reason + actor + meta to ContractService.decline', async () => {
    sessionRef.value = { user: { id: 'buyer-1', email: 'x@x.com', workspaceId: 'buyer-ws-1', workspaceType: 'buyer' } };
    const spy = vi.fn(async () => ({ ok: true as const }));
    mockService(spy);

    const res = await declineContractAction({ docId: DOC_ID, reason: '조건 재검토 필요' });

    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(
      DOC_ID,
      '조건 재검토 필요',
      { userId: 'buyer-1', workspaceId: 'buyer-ws-1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('passes through a service error unchanged (e.g. INVALID_STATE)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'INVALID_STATE' }));
    mockService(spy);
    const r = await declineContractAction({ docId: DOC_ID, reason: '조건 재검토 필요' });
    expect(r).toEqual({ ok: false, error: 'INVALID_STATE' });
  });
});
