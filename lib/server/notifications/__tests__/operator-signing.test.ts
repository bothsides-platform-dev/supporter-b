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
