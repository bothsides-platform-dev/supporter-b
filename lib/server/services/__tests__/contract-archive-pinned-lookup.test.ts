import { describe, expect, it } from 'vitest';
import { Agent } from 'undici';
import { pinnedLookup } from '../contract-archive';

/**
 * 이 파일은 **`undici` 를 목하지 않는다.** 형제 파일 `contract-archive.test.ts` 는
 * Agent 를 목해서 하이드레이션 흐름을 보는데, 그 목은 콜백 시그니처를 스스로
 * 선언하고 스스로 검증하므로 실제 Node/undici 계약이 깨져도 초록이다 —
 * 실제로 3-인자 콜백이 모든 연결을 죽이는 동안 초록이었다.
 * 여기서는 진짜 Agent 로 진짜 연결을 시도해 그 계약을 못박는다.
 */
describe('pinnedLookup — 실제 undici 계약', () => {
  it('Node 가 요구하는 배열 형태로 콜백해 주소 해석 단계를 통과한다', async () => {
    // 127.0.0.1 로 고정한다. 443 에 아무도 없으면 연결 거부, 뭔가 있으면 TLS 오류 —
    // 어느 쪽이든 **주소 해석은 성공한 것**이다. 3-인자 콜백이면 그 전에
    // ERR_INVALID_IP_ADDRESS 로 죽는다.
    const agent = new Agent({
      connect: { lookup: pinnedLookup({ address: '127.0.0.1', family: 4 }) },
    });
    try {
      await fetch('https://archive-pin.invalid/doc.pdf', {
        dispatcher: agent,
      } as RequestInit & { dispatcher: Agent });
      // 여기 도달하면(로컬 443 이 응답) 주소 해석은 당연히 통과한 것이다.
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause;
      expect(cause?.code).not.toBe('ERR_INVALID_IP_ADDRESS');
    } finally {
      await agent.destroy();
    }
  });

  it('고정한 주소를 그대로 싣는다', async () => {
    const seen: unknown[] = [];
    pinnedLookup({ address: '203.0.113.7', family: 4 })('any.example', {}, (err, addresses) => {
      seen.push(err, addresses);
    });
    expect(seen[0]).toBeNull();
    expect(seen[1]).toEqual([{ address: '203.0.113.7', family: 4 }]);
  });
});
