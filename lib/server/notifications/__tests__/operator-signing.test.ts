// 전자서명 라이프사이클 운영자 슬랙 알림 — 메시지 빌더 + fire-and-forget 발화.
//
// Contract:
//   - buildSigningOperatorMessage 는 순수 함수: 이벤트별 이모지·한국어 라벨 +
//     `[코드] 제목`, round > 1 일 때만 `(N회차)` 접미. 금액·수수료는 절대 없다.
//   - notifySigningOperator 는 동기 void, never throws — 전송 실패가 호출자
//     (서비스 전이 커밋 직후)에 절대 전파되지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSigningOperatorMessage,
  notifySigningOperator,
  type SigningOperatorEvent,
} from '../operator-signing';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const BASE = { rfpCode: 'P-2605-0042', rfpTitle: '카드 결제 대행 계약' };
const HOOK = 'https://hooks.slack.com/services/T0/B0/xyz';

describe('buildSigningOperatorMessage', () => {
  const CASES: Array<[SigningOperatorEvent, string, string]> = [
    ['awaiting_created', '📝', '계약 대기 생성'],
    ['sent', '✉️', '계약서 발송'],
    ['attached', '🔗', '계약서 연결'],
    ['completed', '✅', '서명 완료'],
    ['declined', '⛔', '서명 거절'],
    ['expired', '⏰', '서명 만료'],
    ['stale_sent', '⏳', '서명 지연'],
    ['canceled', '🚫', '계약 취소'],
  ];

  it.each(CASES)('%s → emoji + label + [code] title', (event, emoji, label) => {
    const msg = buildSigningOperatorMessage({ ...BASE, event });
    expect(msg).toContain(emoji);
    expect(msg).toContain(label);
    expect(msg).toContain('[P-2605-0042]');
    expect(msg).toContain('카드 결제 대행 계약');
  });

  it('omits the round suffix for round 1 (and when round is absent)', () => {
    expect(buildSigningOperatorMessage({ ...BASE, event: 'sent', round: 1 })).not.toContain(
      '회차',
    );
    expect(buildSigningOperatorMessage({ ...BASE, event: 'sent' })).not.toContain('회차');
  });

  it('appends (N회차) when round > 1', () => {
    expect(buildSigningOperatorMessage({ ...BASE, event: 'sent', round: 2 })).toContain(
      '(2회차)',
    );
  });

  // 디스코드 시절의 masked-link 가드를 대체한다. 슬랙은 `[문구](url)` 를 링크로
  // 렌더하지 않는다 — 슬랙의 위장 링크 문법은 `<url|문구>` 이므로 꺾쇠가 표적이다.
  it('neutralizes a Slack masked link in the user-controlled title', () => {
    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '<https://phish.example|결제 확인>',
    });
    expect(msg).not.toContain('<https://');
    expect(msg).toContain('&lt;https://phish.example|결제 확인&gt;');
    // 우리가 붙이는 [코드] 프레임은 그대로다 — 슬랙에서 대괄호는 문법이 아니다.
    expect(msg).toContain('[P-2605-0042]');
  });

  // 슬랙 Incoming Webhook 페이로드에는 디스코드의 allowed_mentions 에 해당하는
  // 멘션 차단 필드가 **없다**. 이 이스케이프가 무너지면 구매사가 견적 제목만으로
  // 운영 채널 전체를 핑할 수 있다.
  it('neutralizes a channel-wide mention in the title', () => {
    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '<!channel> 긴급',
    });
    expect(msg).not.toContain('<!channel>');
    expect(msg).toContain('&lt;!channel&gt;');
  });

  // 디스코드판은 백슬래시를 먼저 이스케이프해 대괄호가 문법으로 되살아나는 것을
  // 막았다. 슬랙에는 백슬래시 이스케이프 자체가 없어 그 로직이 통째로 무의미하고,
  // 남겨 두면 채널에 `\[x\]` 가 문자 그대로 인쇄된다.
  it('leaves a pre-escaped title untouched (Slack has no backslash escaping)', () => {
    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '\\[x\\]',
    });
    expect(msg).toContain('\\[x\\]');
  });

  it('strips newlines so the title cannot forge a second event line', () => {
    // 제목은 buyer 가 자유 입력한다(z.string().max(200), 개행 제한 없음).
    // 슬랙은 text 의 개행을 그대로 렌더하므로, 막지 않으면 진짜와 구분되지 않는
    // 가짜 이벤트 줄을 운영 채널에 심을 수 있다.
    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '정상 제목\n✅ [계약] 서명 완료 — [P-2605-0099] 위조된 줄',
    });
    expect(msg).not.toContain('\n');
    expect(msg).not.toContain('\r');
    // 내용 자체는 보존한다(잘라내는 게 아니라 한 줄로 접는다).
    expect(msg).toContain('정상 제목');
  });

  // 봉인 입찰 경계 — 이 메시지는 운영 채널에 뜨지만 경쟁 정보는 담지 않는다.
  it('carries no amounts or fees', () => {
    const msg = buildSigningOperatorMessage({ ...BASE, event: 'completed', round: 2 });
    expect(msg).not.toMatch(/[0-9]+원|수수료|%/);
  });
});

describe('notifySigningOperator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('fires the Slack webhook with the built message when configured', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchSpy);

    notifySigningOperator({ ...BASE, event: 'completed' });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).text).toContain('[P-2605-0042]');
  });

  it('does not fetch when SLACK_WEBHOOK_URL is unset', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    notifySigningOperator({ ...BASE, event: 'sent' });

    // fire-and-forget 마이크로태스크가 소진될 때까지 기다린 뒤 무호출을 단정한다.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('never throws synchronously even when fetch rejects', () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', HOOK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    expect(() => notifySigningOperator({ ...BASE, event: 'canceled' })).not.toThrow();
  });
});
