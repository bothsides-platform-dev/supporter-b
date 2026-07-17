// signContractAction — 서명 이미지(dataURL) 파싱이 핵심 검증 지점. prefix 필수 →
// base64 decode → CONTRACT_SIGNATURE_IMAGE_MAX_BYTES 이하 → PNG 매직바이트(8바이트)
// sniff, 실패 시 INVALID_SIGNATURE_IMAGE. 통과분만 Buffer로 ContractService.sign 위임.
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
import { CONTRACT_SIGNATURE_IMAGE_MAX_BYTES } from '@/lib/types/contract-doc';
import { PNG_1X1 } from '@/lib/server/contracts/__tests__/_fixtures';
import { signContractAction } from '../signContractAction';

const DOC_ID = randomUUID();
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`;

function mockService(fn: ReturnType<typeof vi.fn>) {
  const fake = Object.assign(Object.create(ContractService.prototype), { sign: fn });
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

describe('signContractAction', () => {
  it('rejects without a session → UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const spy = vi.fn();
    mockService(spy);
    const r = await signContractAction({ docId: DOC_ID, imageDataUrl: PNG_DATA_URL, method: 'draw' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid docId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await signContractAction({ docId: 'not-a-uuid', imageDataUrl: PNG_DATA_URL, method: 'draw' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an invalid method value → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService(spy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await signContractAction({ docId: DOC_ID, imageDataUrl: PNG_DATA_URL, method: 'stamp' as any });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a dataURL missing the PNG prefix → INVALID_SIGNATURE_IMAGE', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await signContractAction({
      docId: DOC_ID,
      imageDataUrl: PNG_1X1.toString('base64'), // no `data:image/png;base64,` prefix
      method: 'draw',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNATURE_IMAGE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a jpeg-prefixed dataURL → INVALID_SIGNATURE_IMAGE', async () => {
    const spy = vi.fn();
    mockService(spy);
    const r = await signContractAction({
      docId: DOC_ID,
      imageDataUrl: `data:image/jpeg;base64,${PNG_1X1.toString('base64')}`,
      method: 'draw',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNATURE_IMAGE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects decoded bytes that are not a real PNG (bad magic bytes) → INVALID_SIGNATURE_IMAGE', async () => {
    const spy = vi.fn();
    mockService(spy);
    const notPng = Buffer.from('this is definitely not a png file at all', 'utf8');
    const r = await signContractAction({
      docId: DOC_ID,
      imageDataUrl: `data:image/png;base64,${notPng.toString('base64')}`,
      method: 'draw',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNATURE_IMAGE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a decoded image over CONTRACT_SIGNATURE_IMAGE_MAX_BYTES → INVALID_SIGNATURE_IMAGE', async () => {
    const spy = vi.fn();
    mockService(spy);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversized = Buffer.concat([
      pngMagic,
      Buffer.alloc(CONTRACT_SIGNATURE_IMAGE_MAX_BYTES - pngMagic.length + 1, 0),
    ]);
    expect(oversized.length).toBe(CONTRACT_SIGNATURE_IMAGE_MAX_BYTES + 1);
    const r = await signContractAction({
      docId: DOC_ID,
      imageDataUrl: `data:image/png;base64,${oversized.toString('base64')}`,
      method: 'draw',
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_SIGNATURE_IMAGE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts an image exactly at CONTRACT_SIGNATURE_IMAGE_MAX_BYTES (boundary)', async () => {
    const spy = vi.fn(async () => ({ ok: true as const, completed: false }));
    mockService(spy);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const atLimit = Buffer.concat([
      pngMagic,
      Buffer.alloc(CONTRACT_SIGNATURE_IMAGE_MAX_BYTES - pngMagic.length, 0),
    ]);
    expect(atLimit.length).toBe(CONTRACT_SIGNATURE_IMAGE_MAX_BYTES);
    const r = await signContractAction({
      docId: DOC_ID,
      imageDataUrl: `data:image/png;base64,${atLimit.toString('base64')}`,
      method: 'draw',
    });
    expect(r).toEqual({ ok: true, completed: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('decodes a valid PNG dataURL and delegates the exact bytes + actor + meta to ContractService.sign', async () => {
    sessionRef.value = { user: { id: 'buyer-1', email: 'x@x.com', workspaceId: 'buyer-ws-1', workspaceType: 'buyer' } };
    const spy = vi.fn(
      async (
        _docId: string,
        _sig: { imagePng: Buffer; method: string },
        _actor: { userId: string; workspaceId: string },
        _meta: { ip: string | null; userAgent: string | null },
      ) => ({ ok: true as const, completed: true }),
    );
    mockService(spy);

    const res = await signContractAction({ docId: DOC_ID, imageDataUrl: PNG_DATA_URL, method: 'type' });

    expect(res).toEqual({ ok: true, completed: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const [docIdArg, sigArg, actorArg, metaArg] = spy.mock.calls[0]!;
    expect(docIdArg).toBe(DOC_ID);
    expect(Buffer.isBuffer(sigArg.imagePng)).toBe(true);
    expect(sigArg.imagePng.equals(PNG_1X1)).toBe(true);
    expect(sigArg.method).toBe('type');
    expect(actorArg).toEqual({ userId: 'buyer-1', workspaceId: 'buyer-ws-1' });
    expect(metaArg).toEqual({ ip: '203.0.113.7', userAgent: 'vitest-agent' });
  });

  it('passes through a service error unchanged (e.g. EXPIRED)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'EXPIRED' }));
    mockService(spy);
    const r = await signContractAction({ docId: DOC_ID, imageDataUrl: PNG_DATA_URL, method: 'draw' });
    expect(r).toEqual({ ok: false, error: 'EXPIRED' });
  });
});
