import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';
import {
  __setContractArchiveServiceForTest,
  type ContractArchiveService,
} from '@/lib/server/services/contract-archive';

const { captureSigningError } = vi.hoisted(() => ({ captureSigningError: vi.fn() }));
vi.mock('@/lib/server/signing/observability', () => ({ captureSigningError }));

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
    __setContractArchiveServiceForTest(undefined);
    captureSigningError.mockClear();
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

  it('drives pollPending, nudgeStaleAwaiting, the sweep and the stale-sent notice when authorized', async () => {
    const pollPending = vi.fn(async () => ({ polled: 3 }));
    const nudgeStaleAwaiting = vi.fn(async () => ({ nudged: 1 }));
    const sweepMissingContracts = vi.fn(async () => ({ ok: true as const, created: 1 }));
    const notifyStaleSent = vi.fn(async () => ({ notified: 2 }));
    __setContractSigningServiceForTest({
      pollPending,
      nudgeStaleAwaiting,
      sweepMissingContracts,
      notifyStaleSent,
    } as unknown as ContractSigningService);
    __setContractArchiveServiceForTest({
      backfillMissing: vi.fn(async () => ({ ok: true as const, created: 0 })),
      hydratePending: vi.fn(async () => ({
        ok: true as const,
        hydrated: 0,
        failed: 0,
        orphanedRows: 0,
      })),
    } as unknown as ContractArchiveService);
    const res = await POST(req({ secret: 'test-secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      polled: 3,
      nudged: 1,
      sweepCreated: 1,
      staleNotified: 2,
      archiveBackfilled: 0,
      archiveHydrated: 0,
      archiveOrphanedRows: 0,
    });
    expect(pollPending).toHaveBeenCalledWith(50);
    expect(nudgeStaleAwaiting).toHaveBeenCalled();
    // onAward 유실 자가치유 — 같은 틱에 스윕도 돈다.
    expect(sweepMissingContracts).toHaveBeenCalled();
    // 마감 없는 계약(조항형)의 방치 감지 — 같은 주기의 백스톱.
    expect(notifyStaleSent).toHaveBeenCalled();
  });

  function signingStub(): ContractSigningService {
    return {
      pollPending: vi.fn(async () => ({ polled: 0 })),
      nudgeStaleAwaiting: vi.fn(async () => ({ nudged: 0 })),
      sweepMissingContracts: vi.fn(async () => ({ ok: true as const, created: 0 })),
      notifyStaleSent: vi.fn(async () => ({ notified: 0 })),
    } as unknown as ContractSigningService;
  }

  it('drives the archive backfill+hydration step and reports counts in the response', async () => {
    __setContractSigningServiceForTest(signingStub());
    const backfillMissing = vi.fn(async () => ({ ok: true as const, created: 5 }));
    // hydrated/failed/orphanedRows 는 서로 **다른 값**으로 둔다 — 값이 겹치면 라우트가
    // 엉뚱한 필드에서 읽어도(예: archiveOrphanedRows 가 실제로는 failed 를 읽음)
    // 이 단언이 그대로 통과한다.
    const hydratePending = vi.fn(async () => ({
      ok: true as const,
      hydrated: 2,
      failed: 4,
      orphanedRows: 1,
    }));
    __setContractArchiveServiceForTest({
      backfillMissing,
      hydratePending,
    } as unknown as ContractArchiveService);

    const res = await POST(req({ secret: 'test-secret' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archiveBackfilled).toBe(5);
    expect(body.archiveHydrated).toBe(2);
    expect(body.archiveOrphanedRows).toBe(1);
    expect(backfillMissing).toHaveBeenCalledTimes(1);
    expect(hydratePending).toHaveBeenCalledTimes(1);
  });

  // 보관은 내부 파이프라인이다 — 그것이 죽는다고 상태 폴링까지 멎으면 딜룸이 통째로
  // 굳는다(웹훅 유실 시 폴링이 유일한 백스톱이다).
  it('keeps 200 and reports to Sentry when the archive step throws (does not kill the poll)', async () => {
    __setContractSigningServiceForTest({
      ...signingStub(),
      pollPending: vi.fn(async () => ({ polled: 1 })),
    } as unknown as ContractSigningService);
    __setContractArchiveServiceForTest({
      backfillMissing: vi.fn(async () => {
        throw new Error('archive down');
      }),
      hydratePending: vi.fn(async () => ({
        ok: true as const,
        hydrated: 0,
        failed: 0,
        orphanedRows: 0,
      })),
    } as unknown as ContractArchiveService);

    const res = await POST(req({ secret: 'test-secret' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.polled).toBe(1);
    expect(body.archiveBackfilled).toBe(0);
    expect(body.archiveHydrated).toBe(0);
    expect(body.archiveOrphanedRows).toBe(0);
    expect(captureSigningError).toHaveBeenCalledWith('cron.archive_step_failed', expect.any(Error));
  });
});
