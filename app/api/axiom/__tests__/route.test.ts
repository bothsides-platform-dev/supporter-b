import { beforeEach, describe, expect, it, vi } from 'vitest';

// 이 라우트는 비인증 공개 수집 엔드포인트다(브라우저 web-vitals → Axiom).
// Axiom 로거는 네트워크로 나가는 외부 경계라 여기서만 대체한다.
const raw = vi.fn();
const flush = vi.fn();
let logger: { raw: typeof raw; flush: typeof flush } | null;

vi.mock('@/lib/observability/axiom-server', () => ({
  getAxiomWebVitalsLogger: () => logger,
}));

const { POST } = await import('../route');

function post(body: string): Request {
  return new Request('http://localhost/api/axiom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

const vital = (name: string) => ({
  webVital: { name, value: 12, rating: 'good', delta: 12, id: `v4-${name}`, entries: [] },
  _time: 1789398094000,
  source: 'web-vital',
  path: '/',
});

beforeEach(() => {
  raw.mockReset();
  flush.mockReset().mockResolvedValue(undefined);
  logger = { raw, flush };
});

describe('POST /api/axiom', () => {
  it('각 이벤트를 그대로 Axiom 로거에 넘기고 한 번 flush 한 뒤 200 을 준다', async () => {
    const events = [vital('LCP'), vital('FID')];

    const res = await POST(post(JSON.stringify(events)));

    expect(res.status).toBe(200);
    expect(raw.mock.calls).toEqual([[vital('LCP')], [vital('FID')]]);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['JSON 이 아님', '{not json'],
    ['배열이 아님', JSON.stringify(vital('LCP'))],
    ['원소가 객체가 아님', JSON.stringify([vital('LCP'), 'oops'])],
    ['원소가 배열', JSON.stringify([[vital('LCP')]])],
    ['원소가 null', JSON.stringify([null])],
  ])('형태가 틀리면(%s) 400 이고 아무것도 보내지 않는다', async (_label, body) => {
    const res = await POST(post(body));

    expect(res.status).toBe(400);
    expect(raw).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('본문이 지나치게 크면 413 이고 아무것도 보내지 않는다', async () => {
    const huge = JSON.stringify([{ ...vital('LCP'), pad: 'x'.repeat(1024 * 1024) }]);

    const res = await POST(post(huge));

    expect(res.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('이벤트가 지나치게 많으면 413 이고 아무것도 보내지 않는다', async () => {
    const many = JSON.stringify(Array.from({ length: 1000 }, () => ({ n: 1 })));

    const res = await POST(post(many));

    expect(res.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('Axiom 이 설정되지 않았으면(로거 없음) 204 로 조용히 버린다', async () => {
    logger = null;

    const res = await POST(post(JSON.stringify([vital('LCP')])));

    expect(res.status).toBe(204);
  });

  it('Axiom 전송이 실패하면 502 를 준다', async () => {
    flush.mockRejectedValue(new Error('axiom down'));

    const res = await POST(post(JSON.stringify([vital('LCP')])));

    expect(res.status).toBe(502);
  });
});
