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

import {
  disconnectCentrifugoUser,
  isUserPresentInConversation,
  publishChatEvent,
  publishTeamChatEvent,
  teamChatChannel,
} from '../centrifugo';

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
    // 행이 멈춘(거부 아님) Centrifugo 가 전송 응답을 무기한 붙들지 않도록
    // 타임아웃 시그널이 있어야 한다 — 전송 액션이 publish 를 await 한다.
    expect(init.signal).toBeInstanceOf(AbortSignal);
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

describe('teamChatChannel + publishTeamChatEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('teamChatChannel builds the (rfp, workspace)-scoped channel name', () => {
    expect(teamChatChannel('rfp-1', 'ws-1')).toBe('team:rfp:rfp-1:ws-1');
  });

  it('no-ops (resolves, no fetch) when env is unconfigured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', '');
    vi.stubEnv('CENTRIFUGO_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      publishTeamChatEvent('rfp-1', 'ws-1', { type: 'message', id: 'm1' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a publish command to the team channel when configured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await publishTeamChatEvent('rfp-1', 'ws-1', { type: 'message', id: 'm1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api');
    const body = JSON.parse(init.body);
    expect(body.method).toBe('publish');
    expect(body.params.channel).toBe('team:rfp:rfp-1:ws-1');
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
      publishTeamChatEvent('rfp-1', 'ws-1', { type: 'message', id: 'm1' }),
    ).resolves.toBeUndefined();
  });
});

describe('isUserPresentInConversation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns false (no fetch) when env is unconfigured — safe default, no suppression', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', '');
    vi.stubEnv('CENTRIFUGO_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(isUserPresentInConversation('conv-1', 'user-1')).resolves.toBe(
      false,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns true when the user is present in the channel presence map', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({
        result: {
          presence: {
            'client-a': { client: 'client-a', user: 'user-2' },
            'client-b': { client: 'client-b', user: 'user-1' },
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(isUserPresentInConversation('conv-1', 'user-1')).resolves.toBe(
      true,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api');
    const reqBody = JSON.parse(init.body);
    expect(reqBody.method).toBe('presence');
    expect(reqBody.params.channel).toBe('chat:conversation:conv-1');
    expect(init.headers['X-API-Key']).toBe('secret');
  });

  it('returns false when the user is absent from the presence map', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          result: {
            presence: {
              'client-a': { client: 'client-a', user: 'user-2' },
            },
          },
        }),
      }),
    );

    await expect(isUserPresentInConversation('conv-1', 'user-1')).resolves.toBe(
      false,
    );
  });

  it('returns false when fetch throws (best-effort, never throws)', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(isUserPresentInConversation('conv-1', 'user-1')).resolves.toBe(
      false,
    );
  });
});

describe('disconnectCentrifugoUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('no-ops (resolves, no fetch) when env is unconfigured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', '');
    vi.stubEnv('CENTRIFUGO_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(disconnectCentrifugoUser('u1')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a disconnect command for the given userId when configured', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await disconnectCentrifugoUser('u1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api');
    const body = JSON.parse(init.body);
    expect(body.method).toBe('disconnect');
    expect(body.params).toEqual({ user: 'u1' });
    expect(init.headers['X-API-Key']).toBe('secret');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('swallows transport errors (best-effort, never throws)', async () => {
    vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://localhost:8000/api');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(disconnectCentrifugoUser('u1')).resolves.toBeUndefined();
  });
});
