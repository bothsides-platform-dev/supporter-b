// verifyContractDocAction — 문서 무결성(SHA-256 재계산) 검증 배지. 활성 워크스페이스
// 아무 쪽이든(requireActiveWorkspace) 호출 가능, {intact, computed} 패스스루.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

type SessionUser = { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import {
  ContractService,
  __resetContractServiceForTest,
  __setContractServiceForTest,
} from '@/lib/server/services/contract';
import { verifyContractDocAction } from '../verifyContractDocAction';

const DOC_ID = randomUUID();

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { verify: fn });
  __setContractServiceForTest(fake);
  return fake;
}

beforeEach(() => {
  sessionRef.value = { user: { id: 'u1', email: 'x@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
});

afterEach(() => {
  __resetContractServiceForTest();
  sessionRef.value = null;
  vi.clearAllMocks();
});

describe('verifyContractDocAction', () => {
  it('rejects a non-uuid docId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await verifyContractDocAction({ docId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects without a session → UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const spy = vi.fn();
    mockService(spy);
    const r = await verifyContractDocAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates docId + actor to ContractService.verify and passes through {intact, computed}', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'x@x.com', workspaceId: 'ws-1', workspaceType: 'buyer' } };
    const spy = vi.fn(async () => ({ ok: true as const, intact: true, computed: 'abc123' }));
    mockService(spy);

    const res = await verifyContractDocAction({ docId: DOC_ID });

    expect(res).toEqual({ ok: true, intact: true, computed: 'abc123' });
    expect(spy).toHaveBeenCalledWith(DOC_ID, { userId: 'u1', workspaceId: 'ws-1' });
  });

  it('passes through a service error unchanged (e.g. FORBIDDEN)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' }));
    mockService(spy);
    const r = await verifyContractDocAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
