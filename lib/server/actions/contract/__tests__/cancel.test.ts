// cancelContractAction — PG(발송자)가 발송된 계약서를 회수. requirePgActor 게이트 +
// zod 파싱 후 meta 캡처해 ContractService.cancel 위임.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const headersImpl = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: (...a: unknown[]) => headersImpl(...a) }));

type SessionUser = { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import {
  ContractService,
  __resetContractServiceForTest,
  __setContractServiceForTest,
} from '@/lib/server/services/contract';
import { cancelContractAction } from '../cancelContractAction';

const DOC_ID = randomUUID();

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { cancel: fn });
  __setContractServiceForTest(fake);
  return fake;
}

beforeEach(() => {
  headersImpl.mockReset();
  headersImpl.mockResolvedValue({
    get: (name: string) =>
      ({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest-agent' })[name.toLowerCase()] ?? null,
  });
  sessionRef.value = { user: { id: 'u1', email: 'x@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
});

afterEach(() => {
  __resetContractServiceForTest();
  sessionRef.value = null;
  vi.clearAllMocks();
});

describe('cancelContractAction', () => {
  it('rejects a buyer session → FORBIDDEN_PG', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'b@x.com', workspaceId: 'ws1', workspaceType: 'buyer' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await cancelContractAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid docId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await cancelContractAction({ docId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates docId + actor + meta to ContractService.cancel', async () => {
    sessionRef.value = { user: { id: 'pg-1', email: 'x@x.com', workspaceId: 'pg-ws-1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const }));
    mockService(spy);

    const res = await cancelContractAction({ docId: DOC_ID });

    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(
      DOC_ID,
      { userId: 'pg-1', workspaceId: 'pg-ws-1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('passes through a service error unchanged (e.g. FORBIDDEN)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' }));
    mockService(spy);
    const r = await cancelContractAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
