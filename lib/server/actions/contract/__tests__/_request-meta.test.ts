// getRequestMeta() — loginAction.ts clientIp() 미러 + user-agent 동봉.
// RequestMeta({ip,userAgent})는 계약 액션(send/sign/decline/cancel/reassign/recordView)이
// 감사추적(contract_doc_events.ip/userAgent)에 남기는 단일 캡처 지점이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const headersImpl = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  headers: (...args: unknown[]) => headersImpl(...args),
}));

import { getRequestMeta } from '../_request-meta';

function fakeHeaders(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

beforeEach(() => {
  headersImpl.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getRequestMeta', () => {
  it('takes the first x-forwarded-for entry and the user-agent', async () => {
    headersImpl.mockResolvedValue(
      fakeHeaders({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'vitest-agent' }),
    );
    expect(await getRequestMeta()).toEqual({ ip: '203.0.113.7', userAgent: 'vitest-agent' });
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    headersImpl.mockResolvedValue(fakeHeaders({ 'x-real-ip': '198.51.100.9', 'user-agent': 'ua' }));
    expect(await getRequestMeta()).toEqual({ ip: '198.51.100.9', userAgent: 'ua' });
  });

  it('returns ip:null when neither header is present', async () => {
    headersImpl.mockResolvedValue(fakeHeaders({ 'user-agent': 'ua' }));
    expect(await getRequestMeta()).toEqual({ ip: null, userAgent: 'ua' });
  });

  it('returns nulls for both fields when headers() throws (outside a request scope)', async () => {
    headersImpl.mockRejectedValue(new Error('no request scope'));
    expect(await getRequestMeta()).toEqual({ ip: null, userAgent: null });
  });
});
