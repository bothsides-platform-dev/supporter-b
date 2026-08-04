// 전자서명 라이프사이클 운영자 디스코드 알림 — 메시지 빌더 + fire-and-forget 발화.
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

describe('buildSigningOperatorMessage', () => {
  const CASES: Array<[SigningOperatorEvent, string, string]> = [
    ['awaiting_created', '📝', '계약 대기 생성'],
    ['sent', '✉️', '계약서 발송'],
    ['attached', '🔗', '계약서 연결'],
    ['completed', '✅', '서명 완료'],
    ['declined', '⛔', '서명 거절'],
    ['expired', '⏰', '서명 만료'],
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

  it('escapes masked-link brackets in the user-controlled title (Discord phishing guard)', () => {
    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '[결제 확인](https://phish.example)',
    });
    // Discord 는 웹훅 content 의 [문구](url) 를 클릭 가능한 위장 링크로 렌더한다 —
    // 제목의 대괄호는 이스케이프돼 마크다운이 아닌 문자 그대로 보여야 한다.
    expect(msg).not.toContain('[결제 확인](');
    expect(msg).toContain('\\[결제 확인\\]');
    // 우리가 붙이는 [코드] 프레임은 그대로다.
    expect(msg).toContain('[P-2605-0042]');
  });

  it('escapes backslashes so a pre-escaped title cannot free its own brackets', () => {
    // 대괄호만 이스케이프하면 제목이 이미 담고 있던 `\` 가 우리가 붙인 `\` 를
    // 먹어치운다 — `\[x\](url)` 는 `\\[x\\](url)` 이 되고, 디스코드는 `\\` 를
    // 리터럴 백슬래시 하나로 렌더하면서 이스케이프를 소진해 `[x](url)` 가
    // 다시 마크다운 링크로 살아난다. 백슬래시를 먼저 이스케이프해야 막힌다.
    //
    // 문자열 비교로는 `\\]`(백슬래시가 이스케이프됨 = 대괄호는 자유)와
    // `\]`(대괄호가 이스케이프됨)를 구분할 수 없어, 디스코드의 이스케이프
    // 해석을 그대로 흉내 내 **문법으로 살아남는 문자만** 남긴 뒤 판정한다.
    const syntacticOnly = (s: string): string => {
      let out = '';
      for (let i = 0; i < s.length; i += 1) {
        if (s[i] === '\\' && i + 1 < s.length) {
          i += 1; // `\X` → X 는 리터럴, 문법에서 빠진다
          continue;
        }
        out += s[i];
      }
      return out;
    };

    const msg = buildSigningOperatorMessage({
      event: 'sent',
      rfpCode: 'P-2605-0042',
      rfpTitle: '\\[결제 확인\\](https://phish.example)',
    });
    // 마스크드 링크의 결합 지점(`](`)이 문법으로 살아남으면 클릭 가능한 위장 링크다.
    expect(syntacticOnly(msg)).not.toContain('](');
  });

  it('strips newlines so the title cannot forge a second event line', () => {
    // 제목은 buyer 가 자유 입력한다(z.string().max(200), 개행 제한 없음).
    // 디스코드는 웹훅 content 의 개행을 그대로 렌더하므로, 막지 않으면 진짜와
    // 구분되지 않는 가짜 이벤트 줄을 운영 채널에 심을 수 있다.
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
});

describe('notifySigningOperator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('fires the Discord webhook with the built message when configured', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);

    notifySigningOperator({ ...BASE, event: 'completed' });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).content).toContain('[P-2605-0042]');
  });

  it('does not fetch when DISCORD_WEBHOOK_URL is unset', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', '');
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
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/1/abc');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    expect(() => notifySigningOperator({ ...BASE, event: 'canceled' })).not.toThrow();
  });
});
