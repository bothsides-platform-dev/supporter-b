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

  it('drives pollPending, nudgeStaleAwaiting and the missing-contract sweep when authorized', async () => {
    const pollPending = vi.fn(async () => ({ polled: 3 }));
    const nudgeStaleAwaiting = vi.fn(async () => ({ nudged: 1 }));
    const sweepMissingContracts = vi.fn(async () => ({ ok: true as const, created: 1 }));
    __setContractSigningServiceForTest({
      pollPending,
      nudgeStaleAwaiting,
      sweepMissingContracts,
    } as unknown as ContractSigningService);
    const res = await POST(req({ secret: 'test-secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ polled: 3, nudged: 1, sweepCreated: 1 });
    expect(pollPending).toHaveBeenCalledWith(50);
    expect(nudgeStaleAwaiting).toHaveBeenCalled();
    // onAward 유실 자가치유 — 같은 틱에 스윕도 돈다.
    expect(sweepMissingContracts).toHaveBeenCalled();
  });
});
