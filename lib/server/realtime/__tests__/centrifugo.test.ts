// publishChatEvent — best-effort Centrifugo fanout.
//
// Contract (per impl-plan 2026-06-02, §실시간 전송):
//   - Persistence is in Postgres; Centrifugo only fans out. So publish is
//     best-effort: when CENTRIFUGO_HTTP_API_URL / CENTRIFUGO_API_KEY are
//     unconfigured it must no-op (resolve, never throw) — unit tests run with
//     no Centrifugo server.
//   - When configured it POSTs a publish command to the conversation channel
//     and swallows transport errors (best-effort, never blocks the send).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { publishChatEvent } from '../centrifugo';

describe('publishChatEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('no-ops (resolves, no fetch) when env is unconfigured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', '');
    vi.stubEnv('CENTRIFUGO_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      publishChatEvent('conv-1', { type: 'message', id: 'm1' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a publish command to the conversation channel when configured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await publishChatEvent('conv-1', { type: 'message', id: 'm1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api');
    const body = JSON.parse(init.body);
    expect(body.method).toBe('publish');
    expect(body.params.channel).toBe('chat:conversation:conv-1');
    expect(body.params.data).toEqual({ type: 'message', id: 'm1' });
    expect(init.headers['X-API-Key']).toBe('secret');
  });

  it('swallows transport errors (best-effort, never throws)', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(
      publishChatEvent('conv-1', { type: 'message', id: 'm1' }),
    ).resolves.toBeUndefined();
  });
});
