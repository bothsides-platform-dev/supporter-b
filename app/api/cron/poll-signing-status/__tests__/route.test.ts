import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';

function req(opts: { secret?: string } = {}): Request {
  const headers = new Headers();
  if (opts.secret !== undefined) headers.set('x-cron-secret', opts.secret);
  return new Request('http://localhost/api/cron/poll-signing-status', { method: 'POST', headers });
}

describe('POST /api/cron/poll-signing-status', () => {
  beforeEach(() => vi.stubEnv('CRON_SECRET', 'test-secret'));
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetContractSigningServiceForTest();
  });

  it('401 without the cron secret', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('401 with a wrong secret', async () => {
    const res = await POST(req({ secret: 'nope' }));
    expect(res.status).toBe(401);
  });

  it('fails closed when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await POST(req({ secret: '' }));
    expect(res.status).toBe(401);
  });

  it('rejects the secret in a URL query param (header-only — no secret in logs)', async () => {
    const res = await POST(
      new Request('http://localhost/api/cron/poll-signing-status?secret=test-secret', {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('drives pollPending, orphan recovery, and nudgeStaleAwaiting when authorized', async () => {
    const calls: string[] = [];
    const pollPending = vi.fn(async () => {
      calls.push('poll');
      return { polled: 3 };
    });
    const recoverStaleOrphans = vi.fn(async () => {
      calls.push('recover');
      return { recovered: 2 };
    });
    const nudgeStaleAwaiting = vi.fn(async () => {
      calls.push('nudge');
      return { nudged: 1 };
    });
    __setContractSigningServiceForTest({
      pollPending,
      recoverStaleOrphans,
      nudgeStaleAwaiting,
    } as unknown as ContractSigningService);
    const res = await POST(req({ secret: 'test-secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ polled: 3, recovered: 2, nudged: 1 });
    expect(pollPending).toHaveBeenCalledWith(50);
    // 복구가 재넛지보다 먼저 — 이미 발송된 계약을 두고 "올려달라"고 조르면 안 된다.
    expect(calls).toEqual(['poll', 'recover', 'nudge']);
  });
});
