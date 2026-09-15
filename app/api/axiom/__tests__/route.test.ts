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

// 개수 상한만 재려는 테스트용 최소 이벤트 — 바이트 상한에 먼저 걸리지 않을 만큼 작다.
const tiny = () => ({ source: 'web-vital', webVital: {} });

function nestedJson(depth: number, kind: 'array' | 'object' | 'mixed'): string {
  let value = 'null';
  for (let level = 0; level < depth; level += 1) {
    const container = kind === 'mixed' ? (level % 2 === 0 ? 'array' : 'object') : kind;
    value = container === 'array' ? `[${value}]` : `{"child":${value}}`;
  }
  return value;
}

beforeEach(() => {
  raw.mockReset();
  flush.mockReset().mockResolvedValue(undefined);
  logger = { raw, flush };
});

describe('POST /api/axiom', () => {
  it('각 이벤트를 그대로 Axiom 로거에 넘기고, Axiom 전송을 기다리지 않고 200 을 준다', async () => {
    const events = [vital('LCP'), vital('FID')];

    const res = await POST(post(JSON.stringify(events)));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(raw.mock.calls).toEqual([[vital('LCP')], [vital('FID')]]);
    // 전송은 Axiom 배치 클라이언트의 백그라운드 타이머 몫이다 — 요청 경로에서 flush 를
    // 기다리면 모든 비콘이 Axiom 왕복 하나씩을 줄 서서 기다린다.
    expect(flush).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON 이 아님', '{not json'],
    ['배열이 아님', JSON.stringify(vital('LCP'))],
    ['원소가 객체가 아님', JSON.stringify([vital('LCP'), 'oops'])],
    ['원소가 배열', JSON.stringify([[vital('LCP')]])],
    ['원소가 null', JSON.stringify([null])],
    ['web-vital 이벤트가 아님', JSON.stringify([vital('LCP'), { level: 'error', msg: 'outbox.post_commit_failed' }])],
    ['webVital 이 객체가 아님', JSON.stringify([{ source: 'web-vital', webVital: 'LCP' }])],
  ])('형태가 틀리면(%s) 400 이고 아무것도 보내지 않는다', async (_label, body) => {
    const res = await POST(post(body));

    expect(res.status).toBe(400);
    expect(raw).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it.each(['array', 'object', 'mixed'] as const)(
    'JSON %s 중첩은 100단까지 받고 101단부터 400 — 런타임별 직렬화 스택에 의존하지 않는다',
    async (kind) => {
      // JSON.stringify 의 최대 중첩은 Node/V8 버전에 따라 달라진다. 실제 web-vital 구조보다
      // 훨씬 넓은 명시적 상한을 두어, 공유 Axiom 배치가 엔진 차이로 함께 버려지지 않게 한다.
      const atLimitBody = `[{"source":"web-vital","webVital":{},"deep":${nestedJson(100, kind)}}]`;

      const atLimit = await POST(post(atLimitBody));

      expect(atLimit.status).toBe(200);
      expect(raw).toHaveBeenCalledTimes(1);

      raw.mockReset();
      const body = `[{"source":"web-vital","webVital":{},"deep":${nestedJson(101, kind)}}]`;
      expect(body.length).toBeLessThan(64 * 1024);

      const res = await POST(post(body));

      expect(res.status).toBe(400);
      expect(raw).not.toHaveBeenCalled();
    },
  );

  it('본문이 지나치게 크면 413 이고 아무것도 보내지 않는다', async () => {
    const huge = JSON.stringify([{ ...vital('LCP'), pad: 'x'.repeat(1024 * 1024) }]);

    const res = await POST(post(huge));

    expect(res.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('content-length 없이 흘러오는 본문도 상한을 넘는 순간 읽기를 멈추고 413 을 준다', async () => {
    // 청크 전송(chunked)에는 content-length 가 없어 사전 검사를 그냥 지난다. 끝까지 버퍼링한
    // 뒤에 재면 상한이 메모리를 지키지 못한다 — 16KB × 64 = 1MB 를 흘려 보내 몇 청크에서
    // 멈추는지 센다(상한 64KB = 4 청크, 스트림의 선읽기 한 칸까지 허용).
    const chunk = new TextEncoder().encode('x'.repeat(16 * 1024));
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 64) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const req = new Request('http://localhost/api/axiom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);

    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(6);
    expect(raw).not.toHaveBeenCalled();
  });

  it('content-length 가 상한을 넘으면 본문을 읽기 전에 413 을 준다', async () => {
    const req = new Request('http://localhost/api/axiom', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(64 * 1024 + 1) },
      body: JSON.stringify([vital('LCP')]),
    });

    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
    expect(raw).not.toHaveBeenCalled();
  });

  it('상한은 글자 수가 아니라 UTF-8 바이트로 잰다 (멀티바이트 본문)', async () => {
    // '가' 는 UTF-8 3바이트 — 22,000자 ≈ 66KB 로 글자 수는 상한 아래, 바이트는 상한 위.
    const body = JSON.stringify([{ ...vital('LCP'), pad: '가'.repeat(22_000) }]);
    expect(body.length).toBeLessThan(64 * 1024);

    const res = await POST(post(body));

    expect(res.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('이벤트가 지나치게 많으면 413 이고 아무것도 보내지 않는다', async () => {
    const many = JSON.stringify(Array.from({ length: 1000 }, tiny));

    const res = await POST(post(many));

    expect(res.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('이벤트 상한은 100건까지 받고 101건부터 413 이다', async () => {
    const at = await POST(post(JSON.stringify(Array.from({ length: 100 }, tiny))));
    expect(at.status).toBe(200);
    expect(raw).toHaveBeenCalledTimes(100);

    raw.mockReset();
    const over = await POST(post(JSON.stringify(Array.from({ length: 101 }, tiny))));
    expect(over.status).toBe(413);
    expect(raw).not.toHaveBeenCalled();
  });

  it('빈 배열은 아무것도 넘기지 않고 200 이다', async () => {
    const res = await POST(post('[]'));

    expect(res.status).toBe(200);
    expect(raw).not.toHaveBeenCalled();
  });

  it('Axiom 이 설정되지 않았으면(로거 없음) 204 로 조용히 버린다', async () => {
    logger = null;

    const res = await POST(post(JSON.stringify([vital('LCP')])));

    expect(res.status).toBe(204);
  });
});
