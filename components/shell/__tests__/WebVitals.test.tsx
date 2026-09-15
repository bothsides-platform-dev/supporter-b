import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// The vendor hook registers web-vitals observers (absent in jsdom). Capture the two
// callbacks our component hands it instead; `transformWebVitalsMetric` — the part that
// makes the payload serializable — stays real.
const hook = vi.hoisted(() => ({
  calls: [] as Array<{ push: (metric: unknown) => void; flush: () => void }>,
}));
vi.mock('@axiomhq/react', async (importActual) => ({
  ...(await importActual<typeof import('@axiomhq/react')>()),
  useReportWebVitals: (push: (metric: unknown) => void, flush: () => void) => {
    hook.calls.push({ push, flush });
  },
}));

const { WebVitals } = await import('../WebVitals');

const FIBER_KEY = '__reactFiber$webvitals';

// bfcache 복원 후 web-vitals v4 FID 폴리필이 만드는 plain object entry — target 은 React 가
// 관리하는 <body> 라 fiber expando 를 따라가면 body 로 돌아온다(원래 Sentry 에러의 모양).
function polyfilledFidMetric() {
  const body = document.body;
  body.className = 'min-h-full flex flex-col';
  (body as unknown as Record<string, unknown>)[FIBER_KEY] = { stateNode: body };
  return {
    name: 'FID',
    value: 3,
    rating: 'good',
    delta: 3,
    id: 'v4-1789398094000-1000000000000',
    navigationType: 'back-forward-cache',
    entries: [
      { entryType: 'first-input', name: 'keydown', target: body, cancelable: true, startTime: 1000, processingStart: 1003 },
    ],
  };
}

function renderReporter() {
  vi.stubEnv('NODE_ENV', 'production');
  render(<WebVitals />);
  const reporter = hook.calls.at(-1);
  if (!reporter) throw new Error('WebVitals did not register with the web-vitals hook');
  return reporter;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  hook.calls.length = 0;
  delete (document.body as unknown as Record<string, unknown>)[FIBER_KEY];
  document.body.className = '';
});

describe('WebVitals', () => {
  it('does not register web-vitals reporting in development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<WebVitals />);

    expect(hook.calls).toHaveLength(0);
  });

  it('ships a bfcache FID metric carrying a React-managed <body> as one serializable keepalive POST to /api/axiom', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { push, flush } = renderReporter();

    push(polyfilledFidMetric());
    flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/axiom');
    expect(init.method).toBe('POST');
    // keepalive: 탭을 닫는 순간(visibilitychange → hidden)의 마지막 CLS/INP 전송을 브라우저가 끊지 않게.
    expect(init.keepalive).toBe(true);
    const payload = JSON.parse(init.body);
    expect(payload).toHaveLength(1);
    expect(payload[0].source).toBe('web-vital');
    expect(payload[0].webVital.name).toBe('FID');
    expect(payload[0].webVital.entries[0].target).toEqual({
      nodeName: 'BODY',
      tagName: 'BODY',
      className: 'min-h-full flex flex-col',
    });
  });

  it('sends queued metrics once — a second flush with nothing new sends nothing', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { push, flush } = renderReporter();

    push(polyfilledFidMetric());
    flush();
    flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed relay request does not throw into the page', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const { push, flush } = renderReporter();

    push(polyfilledFidMetric());
    expect(() => flush()).not.toThrow();
    // 거부된 fetch 가 unhandled rejection 이 되지 않게 삼켜야 한다 — 한 틱 흘려 확인.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
