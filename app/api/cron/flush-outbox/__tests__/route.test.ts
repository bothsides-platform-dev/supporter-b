/**
 * @vitest-environment node
 */
// POST /api/cron/flush-outbox — periodic outbox drainer for the 1-min crontab.
//
// The ONLY logic under test here is the auth gate + that it drives BOTH the
// generic outbox flush and the delayed chat-digest flush. The digest layer
// behaviour (presence / read short-circuit / recompute) is owned by
// flushChatDigests and tested in lib/server/outbox/__tests__/chat-digest-flush.test.ts —
// we mock both flushes so this test asserts purely the secret gate.
//
// Security property (fail-closed): a request is authorized iff CRON_SECRET is a
// non-empty string AND the provided header/query value equals it. An unset OR
// empty CRON_SECRET → ALWAYS 401, even if the attacker sends a matching value.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flushAllOutbox = vi.fn().mockResolvedValue({ ok: 0, failed: 0 });
vi.mock('@/lib/server/outbox/flush-all', () => ({
  flushAllOutbox: (...args: unknown[]) => flushAllOutbox(...args),
}));

const flushChatDigests = vi.fn().mockResolvedValue({ sent: 0, cancelled: 0, failed: 0 });
vi.mock('@/lib/server/outbox/chat-digest-flush', () => ({
  flushChatDigests: (...args: unknown[]) => flushChatDigests(...args),
}));

const SECRET = 'cron-test-secret';

beforeEach(() => {
  flushAllOutbox.mockClear();
  flushChatDigests.mockClear();
  vi.stubEnv('CRON_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function callWith(opts: { header?: string; query?: string }): Promise<Response> {
  const url = new URL('http://localhost/api/cron/flush-outbox');
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query);
  const headers = new Headers();
  if (opts.header !== undefined) headers.set('x-cron-secret', opts.header);
  return import('../route').then(({ POST }) =>
    POST(new Request(url, { method: 'POST', headers })),
  );
}

describe('POST /api/cron/flush-outbox (cron auth gate)', () => {
  it('(a) wrong secret → 401, neither flush called', async () => {
    const res = await callWith({ header: 'totally-wrong' });
    expect(res.status).toBe(401);
    expect(flushAllOutbox).not.toHaveBeenCalled();
    expect(flushChatDigests).not.toHaveBeenCalled();
  });

  it('(a2) no secret provided at all → 401, neither flush called', async () => {
    const res = await callWith({});
    expect(res.status).toBe(401);
    expect(flushAllOutbox).not.toHaveBeenCalled();
    expect(flushChatDigests).not.toHaveBeenCalled();
  });

  it('(a3) CRON_SECRET unset (empty) → 401 even if attacker sends a matching value (fail-closed)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    // Attacker tries to satisfy `provided === secret` with the empty string.
    const res = await callWith({ header: '' });
    expect(res.status).toBe(401);
    expect(flushAllOutbox).not.toHaveBeenCalled();
    expect(flushChatDigests).not.toHaveBeenCalled();
  });

  it('(b) correct secret in x-cron-secret header → 200, both flushes called', async () => {
    const res = await callWith({ header: SECRET });
    expect(res.status).toBe(200);
    expect(flushAllOutbox).toHaveBeenCalledTimes(1);
    expect(flushChatDigests).toHaveBeenCalledTimes(1);
  });

  it('(b2) correct secret in ?secret= query → 200, both flushes called', async () => {
    const res = await callWith({ query: SECRET });
    expect(res.status).toBe(200);
    expect(flushAllOutbox).toHaveBeenCalledTimes(1);
    expect(flushChatDigests).toHaveBeenCalledTimes(1);
  });
});
