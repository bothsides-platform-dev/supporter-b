import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRfpOperatorMessage, notifyRfpOperator } from '../operator-rfp';

describe('buildRfpOperatorMessage', () => {
  it.each([
    ['request_sent', '견적 요청 발송'],
    ['consultation_requested', '맞춤 상담 요청'],
    ['consultation_reviewing', '상담 검토 시작'],
    ['consultation_rejected', '상담 거절'],
    ['consultation_next', '다음 PG사 상담 요청'],
    ['bid_submitted', '견적 제출'],
    ['awarded', '최종 선정'],
  ] as const)('%s 이벤트와 견적·PG사 정보를 표시한다', (event, label) => {
    expect(buildRfpOperatorMessage({ event, rfpCode: 'P-2609-0001', rfpTitle: '온라인 판매', pgNames: ['알파PG'] }))
      .toContain(`[견적] ${label} — [P-2609-0001] 온라인 판매 · PG사: 알파PG`);
  });

  it('사용자 입력의 멘션·링크·개행을 무력화하고 재제출 회차를 표시한다', () => {
    const message = buildRfpOperatorMessage({ event: 'bid_submitted', rfpCode: 'P-2609-0001',
      rfpTitle: '제목\n<!channel>', pgNames: ['<https://evil.example|PG>'], round: 2 });
    expect(message).toContain('제목 &lt;!channel&gt;');
    expect(message).toContain('PG사: &lt;https://evil.example|PG&gt;');
    expect(message).toContain('(2회차)');
    expect(message).not.toContain('\n');
    expect(message).not.toContain('<!channel>');
  });

  it('첫 제출에는 회차를 붙이지 않고 PG사 이름 목록을 표시한다', () => {
    const message = buildRfpOperatorMessage({ event: 'request_sent', rfpCode: 'P-2609-0001',
      rfpTitle: '온라인 판매', pgNames: ['알파PG', '베타PG'], round: 1 });
    expect(message).toContain('PG사: 알파PG, 베타PG');
    expect(message).not.toContain('회차');
  });

  it('대량 발송에서는 슬랙 길이 안에서 이름을 표시하고 생략된 PG사 수를 밝힌다', () => {
    const pgNames = Array.from({ length: 50 }, (_, i) => `PG ${i + 1} ${'<'.repeat(190)}`);
    const message = buildRfpOperatorMessage({ event: 'request_sent', rfpCode: 'P-2609-0001',
      rfpTitle: '온라인 판매', pgNames });
    expect(message.length).toBeLessThanOrEqual(4000);
    expect(message).toContain('PG 1');
    expect(message).toMatch(/외 \d+곳/);
  });
});

describe('notifyRfpOperator', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('슬랙 전송 실패를 호출자에게 전파하지 않는다', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/T0/B0/test');
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(notifyRfpOperator({ event: 'awarded', rfpCode: 'P-2609-0001',
      rfpTitle: '온라인 판매', pgNames: ['알파PG'] })).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
