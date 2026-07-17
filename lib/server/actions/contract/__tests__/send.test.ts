// sendContractAction — PG가 선정된 RFP에 전자계약서를 발송. 세션 검증(requirePgActor)
// + zod 파싱 후 ContractService.send 로 위임한다. 서비스 레이어 로직(Wave 3)은 이미
// contract.test.ts 가 검증하므로, 이 테스트는 액션 레이어 책임(입력 검증·세션 게이트·
// meta 캡처·위임 인자·결과 패스스루)만 __setContractServiceForTest 로 서비스를 모킹해 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const headersImpl = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: (...a: unknown[]) => headersImpl(...a) }));

type SessionUser = { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
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
import { sendContractAction } from '../sendContractAction';
import type { ContractPartiesV1 } from '@/lib/types/contract-doc';

const TEMPLATE_ID = randomUUID();
const PG_SIGNER_ID = randomUUID();

const PARTIES: ContractPartiesV1 = {
  _v: 1,
  buyer: { name: '주식회사 서포트비', repName: '김구매', bizNo: '123-45-67890' },
  pg: { name: '나이스페이먼츠 주식회사', repName: '박대행', bizNo: null },
};

function validInput(overrides?: Record<string, unknown>) {
  return {
    rfpCode: 'P-2607-0042',
    templateId: TEMPLATE_ID,
    title: '전자계약서',
    parties: PARTIES,
    pgSignerUserId: PG_SIGNER_ID,
    expiresInDays: 14,
    ...overrides,
  };
}

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { send: fn });
  __setContractServiceForTest(fake);
  return fake;
}

beforeEach(() => {
  headersImpl.mockReset();
  headersImpl.mockResolvedValue({
    get: (name: string) =>
      ({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest-agent' })[name.toLowerCase()] ?? null,
  });
});

afterEach(() => {
  __resetContractServiceForTest();
  sessionRef.value = null;
  vi.clearAllMocks();
});

describe('sendContractAction', () => {
  it('rejects without a PG session → FORBIDDEN_PG', async () => {
    sessionRef.value = null;
    const spy = vi.fn();
    mockService(spy);
    const r = await sendContractAction(validInput());
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a buyer session → FORBIDDEN_PG', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'b@x.com', workspaceId: 'ws1', workspaceType: 'buyer' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await sendContractAction(validInput());
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an invalid rfpCode format → INVALID_INPUT', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'pg@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await sendContractAction(validInput({ rfpCode: 'not-a-code' }));
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects expiresInDays out of the 1..90 range → INVALID_INPUT', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'pg@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await sendContractAction(validInput({ expiresInDays: 91 }));
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unknown extra field (zod .strict()) → INVALID_INPUT', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'pg@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn();
    mockService(spy);
    const r = await sendContractAction(validInput({ bogus: 'field' }));
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('defaults expiresInDays to 14 when omitted', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'pg@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const, docId: 'd1', code: 'CT-2607-0001' }));
    mockService(spy);
    const { expiresInDays: _omit, ...rest } = validInput();
    await sendContractAction(rest);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInDays: 14 }),
      { userId: 'u1', workspaceId: 'ws1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('delegates to ContractService.send with the parsed input, actor, and captured request meta', async () => {
    sessionRef.value = { user: { id: 'pg-user-1', email: 'pg@x.com', workspaceId: 'pg-ws-1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const, docId: 'doc-1', code: 'CT-2607-0001' }));
    mockService(spy);

    const res = await sendContractAction(validInput());

    expect(res).toEqual({ ok: true, docId: 'doc-1', code: 'CT-2607-0001' });
    expect(spy).toHaveBeenCalledWith(
      {
        rfpCode: 'P-2607-0042',
        templateId: TEMPLATE_ID,
        title: '전자계약서',
        parties: PARTIES,
        pgSignerUserId: PG_SIGNER_ID,
        expiresInDays: 14,
      },
      { userId: 'pg-user-1', workspaceId: 'pg-ws-1' },
      { ip: '203.0.113.7', userAgent: 'vitest-agent' },
    );
  });

  it('passes through a service error unchanged (e.g. NOT_AWARDED)', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'pg@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: false as const, error: 'NOT_AWARDED' }));
    mockService(spy);
    const r = await sendContractAction(validInput());
    expect(r).toEqual({ ok: false, error: 'NOT_AWARDED' });
  });
});
