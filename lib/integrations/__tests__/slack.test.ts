// sendSlackMessage — 운영자 슬랙 Incoming Webhook best-effort 전송.
//
// Contract:
//   - SLACK_WEBHOOK_URL 미설정/빈값 → 전송 생략 + `[slack DEV]` 로그, { ok: true }
//   - 설정 시 → 웹훅 URL 로 JSON POST({ text }) — 그 키 하나뿐, 타임아웃 시그널 포함
//   - 비-ok 응답·fetch throw → { ok: false } resolve (never throws) + Sentry
//   - 전송층은 이스케이프하지 않는다 — 그건 메시지 빌더(escapeSlackText)의 일이다
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { escapeSlackText, sendSlackMessage } from '../slack';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const HOOK = 'https://hooks.slack.com/services/T0/B0/xyz';

const okRes = () => ({ ok: true, status: 200, text: async () => 'ok' });

// 슬랙 실패 응답은 상태코드 + **평문 본문**(no_service·invalid_payload…)으로 온다.
// mock 에 text() 가 없으면 구현의 `await res.text()` 가 TypeError 를 던져 바깥
// catch 로 빠지고, 테스트는 http_403 대신 엉뚱한 에러를 보게 된다.
const failRes = (status: number, body = 'no_service') => ({
  ok: false,
  status,
  text: async () => body,
});

describe('sendSlackMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('skips (resolves ok, no fetch) when SLACK_WEBHOOK_URL is unset', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(sendSlackMessage({ text: '테스트 메시지' })).resolves.toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[slack DEV]'));
    logSpy.mockRestore();
  });

  it('POSTs JSON { text } to the webhook URL with a timeout signal when configured', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    const fetchSpy = vi.fn().mockResolvedValue(okRes());
    vi.stubGlobal('fetch', fetchSpy);

    await expect(sendSlackMessage({ text: '✅ 완료' })).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(HOOK);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    // deep-equal 이어야 한다: mrkdwn/link_names/blocks 같은 군더더기 키가 새면 실패.
    // `mrkdwn` 은 기본 on, `link_names`/`parse` 는 기본 off — 우리가 원하는 값이 곧
    // 기본값이라 아무것도 보내지 않는 것이 정답이다.
    expect(JSON.parse(init.body)).toEqual({ text: '✅ 완료' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  // 전송층에 "친절한" 이스케이프가 들어가면 빌더가 이미 이스케이프한 메시지가 이중으로
  // 처리돼 `&amp;lt;` 가 채널에 그대로 뜬다. 그 회귀를 여기서 못박는다.
  it('does not escape the text — the transport passes bytes through untouched', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    const fetchSpy = vi.fn().mockResolvedValue(okRes());
    vi.stubGlobal('fetch', fetchSpy);

    const raw = '<!channel> & <b>';
    await sendSlackMessage({ text: raw });

    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text).toBe(raw);
  });

  it('clamps text above the 4000-char recommendation instead of failing the send', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    const fetchSpy = vi.fn().mockResolvedValue(okRes());
    vi.stubGlobal('fetch', fetchSpy);

    await sendSlackMessage({ text: 'x'.repeat(5000) });

    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).text.length).toBe(4000);
  });

  it('returns { ok: false } with the provider error body captured to Sentry on a non-ok response', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failRes(403, 'invalid_token')));

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'http_403',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    // 403 하나로는 "웹훅이 폐기됨"과 "슬랙 장애"를 구분할 수 없다 — 본문이 그 차이다.
    const [, opts] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect((opts as { extra?: Record<string, unknown> } | undefined)?.extra).toMatchObject({
      context: 'slack',
      status: 403,
      body: 'invalid_token',
    });
  });

  // 429 는 예상된 결과다(리밋 1건/초 vs notifyStaleSent 틱당 50건). Sentry 로 올리면
  // dedupe 가 없어 50개의 개별 이벤트가 나가고, 드롭된 알림마다 아웃바운드 요청이
  // 하나씩 더 붙는다.
  it('treats 429 as expected — logs a warning instead of paying for a Sentry event', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate_limited',
        headers: { get: () => '30' },
      }),
    );
    const { logger } = await import('@/lib/observability/logger');

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'http_429',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('slack.rate_limited', { retryAfter: '30' });
  });

  it('survives a 429 response that carries no headers object', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'http_429',
    });
  });

  it('still resolves { ok: false } when reading the error body itself rejects', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => {
          throw new Error('body stream already read');
        },
      }),
    );

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'http_403',
    });
  });

  it('resolves { ok: false } (never throws) and captures to Sentry when fetch rejects', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'connection refused',
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  // reject 사유가 Error 라는 보장이 없다. `(e as Error).message` 였을 때 null 사유는
  // catch 안에서 다시 던져 never-throws 계약을 깼다.
  it('falls back to slack_threw when the rejection is not an Error', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('boom'));

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'slack_threw',
    });
  });

  it('never throws when the rejection reason is null', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(null));

    await expect(sendSlackMessage({ text: '메시지' })).resolves.toEqual({
      ok: false,
      error: 'slack_threw',
    });
  });

  // 가입 알림에는 신청자 실명·상호가 실린다. 이 로그는 PM2 로 나가 Sentry 스크러버를
  // 지나지 않으므로 본문 조각이 남으면 안 된다.
  it('does not leak message content into the DEV skip log', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    vi.stubGlobal('fetch', vi.fn());
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendSlackMessage({ text: '📥 [가입] 새 입점 심사 요청 — 김신청 (구매사)' });

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('[slack DEV]');
    expect(logged).not.toContain('김신청');
    expect(logged).toMatch(/len=\d+/);
    logSpy.mockRestore();
  });

  it('logs slack.sent with a duration on success', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes()));
    const { logger } = await import('@/lib/observability/logger');

    await sendSlackMessage({ text: '메시지' });

    expect(logger.info).toHaveBeenCalledWith('slack.sent', {
      durationMs: expect.any(Number),
    });
  });
});

// 구분자는 소스에 리터럴로 넣지 않는다 — 눈에 보이지 않아 파일을 조용히 깨뜨리고
// Edit 매칭도 실패시킨다. 코드포인트로만 만든다.
const NEL = String.fromCharCode(0x85);
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

describe('escapeSlackText', () => {
  it('escapes the ampersand', () => {
    expect(escapeSlackText('a & b')).toBe('a &amp; b');
  });

  // 슬랙의 위장 링크 문법. 꺾쇠만 죽이면 문법 자체가 성립하지 않는다.
  it('neutralizes a masked link so no bare angle brackets survive', () => {
    const out = escapeSlackText('<https://evil.example|innocent>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toBe('&lt;https://evil.example|innocent&gt;');
  });

  // 디스코드판의 allowed_mentions 를 대신하는 유일한 방어. 슬랙 Incoming Webhook
  // 페이로드에는 멘션 차단 필드가 없으므로 이 이스케이프가 무너지면 구매사가
  // 견적 제목만으로 운영 채널 전체를 핑할 수 있다.
  it('neutralizes a channel-wide mention', () => {
    expect(escapeSlackText('<!channel>')).toBe('&lt;!channel&gt;');
    expect(escapeSlackText('<!channel>')).not.toContain('<!channel>');
  });

  it('neutralizes a user mention', () => {
    expect(escapeSlackText('<@U012AB3CD>')).toBe('&lt;@U012AB3CD&gt;');
  });

  // 순서 핀. `&` 를 나중에 처리하면 `&lt;` 가 `&amp;lt;` 로 이중 인코딩돼
  // 채널에 `&lt;` 라는 글자가 그대로 보인다(보안 문제는 아니고 표시 문제다).
  it('escapes the ampersand first so entities are not double-encoded', () => {
    expect(escapeSlackText('<')).toBe('&lt;');
  });

  it('folds ASCII control characters so the title cannot forge a second line', () => {
    const out = escapeSlackText('a\nb\r\tc');
    expect(out).not.toMatch(/[\n\r\t]/);
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('c');
  });

  // CSS `white-space: pre-wrap` 에서 강제 개행으로 렌더될 수 있는 셋. ASCII 제어문자만
  // 접으면 줄 위조 방어에 이만큼 구멍이 남는다(디스코드판에도 있던 잠재 갭).
  it('folds the Unicode line separators (U+0085, U+2028, U+2029) too', () => {
    const out = escapeSlackText(`a${NEL}b${LINE_SEP}c${PARA_SEP}d`);
    expect(out).not.toContain(NEL);
    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARA_SEP);
    expect(out).toBe('a b c d');
  });

  it('trims the result', () => {
    expect(escapeSlackText('  제목  ')).toBe('제목');
  });

  // 접기가 trim 보다 먼저라, 제어문자·공백뿐인 입력은 통째로 사라진다. 빌더가 그 결과를
  // 그대로 보간하므로 제목이 빈 이벤트 줄이 나갈 수 있다 — 막지는 않되 동작을 못박는다.
  it('collapses an all-whitespace input to an empty string', () => {
    expect(escapeSlackText('')).toBe('');
    expect(escapeSlackText('\n\t  ')).toBe('');
  });

  // 디스코드 시절의 백슬래시+대괄호 이스케이프가 남아 있으면 슬랙 채널에
  // `\[결제 확인\]` 이 문자 그대로 인쇄된다 — 슬랙에는 백슬래시 이스케이프가 없다.
  it('leaves brackets and backslashes alone (the Discord logic is gone)', () => {
    expect(escapeSlackText('[결제 확인]')).toBe('[결제 확인]');
    expect(escapeSlackText('[결제 확인]')).not.toContain('\\[');
    expect(escapeSlackText('\\[x\\]')).toBe('\\[x\\]');
  });
});
