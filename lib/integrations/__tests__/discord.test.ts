// sendDiscordMessage — 운영자 디스코드 웹훅 best-effort 전송.
//
// Contract:
//   - DISCORD_WEBHOOK_URL 미설정/빈값 → 전송 생략 + `[discord DEV]` 로그, { ok: true }
//   - 설정 시 → 웹훅 URL 로 JSON POST({ content }), 타임아웃 시그널 포함
//   - 비-ok 응답·fetch throw → { ok: false } resolve (never throws) + Sentry
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendDiscordMessage } from '../discord';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('sendDiscordMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('skips (resolves ok, no fetch) when DISCORD_WEBHOOK_URL is unset', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(sendDiscordMessage({ content: '테스트 메시지' })).resolves.toEqual({
      ok: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[discord DEV]'));
    logSpy.mockRestore();
  });

  it('POSTs JSON { content } to the webhook URL with a timeout signal when configured', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(sendDiscordMessage({ content: '✅ 완료' })).resolves.toEqual({
      ok: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/1/abc');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      content: '✅ 완료',
      allowed_mentions: { parse: [] },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('disables mention parsing (allowed_mentions) — user-controlled titles must not ping the channel', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    await sendDiscordMessage({ content: '@everyone 몰래 핑' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).allowed_mentions).toEqual({ parse: [] });
  });

  it('clamps content above the Discord 2000-char limit instead of failing the send', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    await sendDiscordMessage({ content: 'x'.repeat(3000) });

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).content.length).toBeLessThanOrEqual(2000);
  });

  it('returns { ok: false } and captures to Sentry on a non-ok response (e.g. 429)', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const result = await sendDiscordMessage({ content: '메시지' });

    expect(result.ok).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('resolves { ok: false } (never throws) and captures to Sentry when fetch rejects', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(sendDiscordMessage({ content: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'connection refused',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
