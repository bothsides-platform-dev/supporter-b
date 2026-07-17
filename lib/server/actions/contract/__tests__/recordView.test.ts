// recordContractViewAction — 뷰 기록은 비차단(best-effort): 서비스가 정상 반환하면
// (ok:true/false 어느 쪽이든) 그 결과를 그대로 돌려주지만, 서비스가 throw 하면
// 뷰어 경험을 막지 않도록 조용히 ok:true 로 흡수한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const headersImpl = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: (...a: unknown[]) => headersImpl(...a) }));

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
import { recordContractViewAction } from '../recordContractViewAction';

const DOC_ID = randomUUID();

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { recordView: fn });
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

describe('recordContractViewAction', () => {
  it('rejects a non-uuid docId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await recordContractViewAction({ docId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects without a session → UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const spy = vi.fn();
    mockService(spy);
    const r = await recordContractViewAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates docId + actor + meta to ContractService.recordView', async () => {
    sessionRef.value = { user: { id: 'pg-1', email: 'x@x.com', workspaceId: 'pg-ws-1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const }));
    mockService(spy);

    const res = await recordContractViewAction({ docId: DOC_ID });

    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(
      DOC_ID,
      { userId: 'pg-1', workspaceId: 'pg-ws-1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('passes through a service ok:false result unchanged (e.g. NOT_FOUND)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'NOT_FOUND' }));
    mockService(spy);
    const r = await recordContractViewAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('swallows a thrown service error into ok:true (best-effort, never blocks the viewer)', async () => {
    const spy = vi.fn(async () => {
      throw new Error('db hiccup');
    });
    mockService(spy);
    const r = await recordContractViewAction({ docId: DOC_ID });
    expect(r).toEqual({ ok: true });
  });
});
